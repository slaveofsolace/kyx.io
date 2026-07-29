"""Build the Inkfall Foundry Rev5 structural/portal correction.

Rev5 is a derivative presentation pass over the frozen KYX.IO Press Hall
source. It corrects the rejected Rev4 bridge construction and authors a paired
Red Fold portal landmark. Exported meshes are render-only; Revision 3 collision,
spawns, zones, package identity, and catalog default remain immutable.

The upstream NotHereButAfk/Ev.io ref was inspected only for abstract layout
principles. No upstream code, assets, constants, coordinates, or wording are
used by this builder.
"""

from __future__ import annotations

import importlib.util
import hashlib
import json
import math
from pathlib import Path
import struct
from typing import Any

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


SCRIPT_DIR = Path(__file__).resolve().parent
REV4_BUILDER_PATH = (
    SCRIPT_DIR.parent / "press-archive-rev4" / "build_press_archive_rev4.py"
)
REV4_SPEC = importlib.util.spec_from_file_location(
    "inkfall_press_archive_rev4_base",
    REV4_BUILDER_PATH,
)
if REV4_SPEC is None or REV4_SPEC.loader is None:
    raise RuntimeError(f"Cannot load Rev4 base builder: {REV4_BUILDER_PATH}")
rev4 = importlib.util.module_from_spec(REV4_SPEC)
REV4_SPEC.loader.exec_module(rev4)


SCOPE = "G5_INKFALL_REV5_GEOMETRY_PORTAL_RENDER_ONLY_NON_DEFAULT"
GENERATOR_ID = "inkfall_foundry_press_archive_rev5"
ART_REVISION = "5.0"
AUTHORITY_PORTAL_CAPABILITY = "inkfall_rev5_linked_world_portal_v1"
DONOR_ROOT = SCRIPT_DIR / "donors" / "quaternius-standard"
DONOR_GEOMETRY_ROOT = DONOR_ROOT / "geometry-only"
DONOR_MANIFEST_PATH = DONOR_GEOMETRY_ROOT / "geometry-only-donor-manifest.json"
PORTAL_MACHINE_DONOR_ROOT = (
    SCRIPT_DIR / "donors" / "quaternius-teleporter-base"
)
PORTAL_MACHINE_SOURCE_MANIFEST_PATH = (
    PORTAL_MACHINE_DONOR_ROOT / "donor-manifest.json"
)
PORTAL_MACHINE_DONOR_MANIFEST_PATH = (
    PORTAL_MACHINE_DONOR_ROOT
    / "geometry-only"
    / "geometry-only-donor-manifest.json"
)
PORTAL_MACHINE_DONOR_PATH = (
    PORTAL_MACHINE_DONOR_ROOT
    / "geometry-only"
    / "Teleporter_Base.geometry-only.glb"
)
PORTAL_MACHINE_DONOR_ID = "Teleporter_Base"
PORTAL_FRAME_DONOR_ROOT = (
    SCRIPT_DIR / "donors" / "polygonal-mind-abm-teleporter01"
)
PORTAL_FRAME_SOURCE_MANIFEST_PATH = (
    PORTAL_FRAME_DONOR_ROOT / "donor-manifest.json"
)
PORTAL_FRAME_DONOR_MANIFEST_PATH = (
    PORTAL_FRAME_DONOR_ROOT
    / "geometry-only"
    / "geometry-only-donor-manifest.json"
)
PORTAL_FRAME_DONOR_PATH = (
    PORTAL_FRAME_DONOR_ROOT
    / "geometry-only"
    / "Teleporter01_Art.frame.geometry-only.glb"
)
PORTAL_FRAME_DONOR_ID = "Teleporter01_Art_Frame"
EXPECTED_DONOR_IDS = {
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
}

ROUTE_POINTS = rev4.ROUTE_POINTS
TRAVERSAL_CLEARANCE_POINTS = ROUTE_POINTS + ((-22.0, 21.5, 6.06),)
ROUTE_WIDTH_METERS = 2.18
ROUTE_CLEAR_WIDTH_METERS = 3.5
ROUTE_CLEAR_HEIGHT_METERS = 4.25
AUTHORITY_STANDING_CAPSULE_RADIUS_METERS = 0.35
AUTHORITY_STANDING_CAPSULE_HEIGHT_METERS = 1.8
BRIDGE_SECTION = {
    "deckWidthMeters": 2.34,
    "edgeGirderOffsetMeters": 1.23,
    "maximumRailRadiusMeters": 0.052,
    "supportOffsetMeters": 0.96,
}
LANDING_CENTER = (-22.0, 19.0, 5.82)
LANDING_SIZE = (8.0, 7.0, 0.36)
EXPECTED_PARENT_MESH_COUNT = rev4.EXPECTED_PARENT_MESH_COUNT
EXPECTED_PARENT_MATERIALS = rev4.EXPECTED_PARENT_MATERIALS

PORTAL_ENDPOINTS = (
    {
        "id": "red_fold_lower",
        "partnerId": "red_fold_upper",
        "triggerCenterMapMm": (-4_000, -3_000, -10_000),
        "triggerHalfExtentsMapMm": (1_500, 1_000, 1_500),
        "exitFeetMapMm": (1_539, 1_431, -4_461),
        "exitYawMilliDegrees": 45_000,
        "visualCenterBlenderMeters": (-4.0, -10.0, -1.25),
        "floorTopBlenderMeters": -3.0,
        "colorMaterial": "V3_AQUA_INDICATOR",
    },
    {
        "id": "red_fold_upper",
        "partnerId": "red_fold_lower",
        "triggerCenterMapMm": (1_000, 1_431, -5_000),
        "triggerHalfExtentsMapMm": (1_500, 1_400, 300),
        "exitFeetMapMm": (-4_500, -3_000, -12_500),
        "exitYawMilliDegrees": 90_000,
        "visualCenterBlenderMeters": (1.0, -5.0, 3.181),
        "floorTopBlenderMeters": 1.431,
        "colorMaterial": "V3_WORN_AMBER",
    },
)

FROZEN_INPUTS = {
    **rev4.FROZEN_INPUTS,
    # The accepted player-eye alignment checkpoint changed only committed
    # spawn yaw values and the package's canonical digest. Collision geometry,
    # spawn positions, zones, and the Revision 3 fixture remain unchanged.
    "revision3Package": (
        "assets/source/maps/inkfall-foundry/revisions/revision-3/"
        "runtime/map.package.v3.json",
        "14648737f7e511370e1136ac5150fa25b1ebfdc9bff2dd86ba7b2ce83e1c45b6",
    ),
    "revision3AuthorityFixture": (
        "assets/source/maps/inkfall-foundry/runtime/"
        "combat-authority-fixture.g5-revision3.v1.json",
        "96cbe4c7317de489dcd8cc42ea3e37dc41f8157982db8c01094bd8bdaf1008a1",
    ),
    "catalogConstants": (
        "src/content/maps/constants.ts",
        "cc9b938ccfa0b9d2d8e7d6ac08baf8fb3fc014868bd630f05928513a25a2186f",
    ),
    "rejectedRev4Builder": (
        "assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/"
        "build_press_archive_rev4.py",
        "c34bb568c3eb1f6158f19578338be6acb39ae0ffea71dfd4217b53041c5661dd",
    ),
    "rejectedRev4GameplayEvidence": (
        "assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4/"
        "renders/inkfall-rev4-press-archive-gameplay_continuity.png",
        "7d832017bc4403042dbc55d73f400f87daec1c9245925718101a215648925066",
    ),
    "rejectedRev4RiseEvidence": (
        "assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4/"
        "renders/inkfall-rev4-press-archive-archive_rise.png",
        "c9b269f8a495bc46820704147c6ad8e5f942ed1bff20451e217bc3b9a0ecdb7c",
    ),
}

NON_CLAIMS = (
    "G5_NOT_PASSED",
    "REVISION_3_AUTHORITY_NOT_PROMOTED",
    "REVISION_5_ART_NOT_DEFAULT",
    "RENDER_GEOMETRY_NOT_COLLISION_AUTHORITY",
    "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_2_4_8_PLAYER_REVIEW_NOT_PASSED",
    "PORTAL_COMBAT_READABILITY_NOT_HUMAN_ACCEPTED",
    "TARGET_HARDWARE_PERFORMANCE_NOT_ACCEPTED",
    "NO_DEPLOYMENT_OR_PUBLISHING_AUTHORIZATION_USED",
)


# Reuse only project-authored helper primitives from the adjacent Rev4 builder.
rev4.SCOPE = SCOPE
rev4.GENERATOR_ID = GENERATOR_ID
rev4.ART_REVISION = ART_REVISION
rev4.ROUTE_POINTS = ROUTE_POINTS
rev4.ROUTE_WIDTH_METERS = ROUTE_WIDTH_METERS
rev4.LANDING_CENTER = LANDING_CENTER
rev4.LANDING_SIZE = LANDING_SIZE
rev4.FROZEN_INPUTS = FROZEN_INPUTS


def mark_render_only(
    obj: bpy.types.Object,
    zone: str,
    family: str,
) -> bpy.types.Object:
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "rev5_authored_art_render_only"
    obj["kyx_zone"] = zone
    obj["kyx_family"] = family
    obj["kyx_collision"] = False
    obj["kyx_authority"] = False
    return obj


rev4.mark_render_only = mark_render_only

add_box = rev4.add_box
add_cylinder = rev4.add_cylinder
add_torus = rev4.add_torus
add_beam = rev4.add_beam
add_path_slab = rev4.add_path_slab
interpolate = rev4.interpolate
path_side = rev4.path_side
offset_point = rev4.offset_point


def map_mm_to_blender(value: tuple[int, int, int]) -> tuple[float, float, float]:
    # Blender +Y exports to glTF/Three -Z. Authority +Z also maps to Three -Z,
    # so the Blender Y coordinate must preserve (not negate) map Z.
    return (value[0] / 1_000.0, value[2] / 1_000.0, value[1] / 1_000.0)


def point_inside(
    point: tuple[int, int, int],
    center: tuple[int, int, int],
    half_extents: tuple[int, int, int],
) -> bool:
    return all(
        abs(value - origin) <= extent
        for value, origin, extent in zip(point, center, half_extents)
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_geometry_donors(repo_root: Path) -> dict[str, Any]:
    """Fail closed on the small CC0 geometry-only donor library."""

    if not DONOR_MANIFEST_PATH.is_file():
        raise RuntimeError(f"Missing donor manifest: {DONOR_MANIFEST_PATH}")
    manifest = json.loads(DONOR_MANIFEST_PATH.read_text(encoding="utf-8"))
    source = manifest.get("source", {})
    process = manifest.get("process", {})
    if source.get("licenseId") != "CC0-1.0":
        raise RuntimeError("Inkfall donor set must remain CC0-1.0")
    if process.get("geometryOnly") is not True:
        raise RuntimeError("Inkfall donor set must remain geometry-only")
    if process.get("materialsIncluded") is not False:
        raise RuntimeError("Inkfall donor set unexpectedly contains materials")
    if process.get("texturesIncluded") is not False:
        raise RuntimeError("Inkfall donor set unexpectedly contains textures")
    if process.get("runtimeCollisionAuthority") is not False:
        raise RuntimeError("Inkfall donor set cannot become collision authority")

    records = {
        item["id"]: item
        for item in manifest.get("models", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if set(records) != EXPECTED_DONOR_IDS:
        raise RuntimeError(
            "Unexpected Inkfall donor inventory: "
            f"{sorted(records)}"
        )

    verified: list[dict[str, Any]] = []
    for model_id in sorted(EXPECTED_DONOR_IDS):
        record = records[model_id]
        derived = record.get("derivedGeometryOnlyGlb", {})
        path = DONOR_GEOMETRY_ROOT / str(derived.get("name", ""))
        if not path.is_file():
            raise RuntimeError(f"Missing donor GLB for {model_id}: {path}")
        actual_bytes = path.stat().st_size
        actual_hash = sha256_file(path)
        if actual_bytes != derived.get("bytes"):
            raise RuntimeError(f"Donor byte count changed for {model_id}")
        if actual_hash != derived.get("sha256"):
            raise RuntimeError(f"Donor hash changed for {model_id}")
        verified.append(
            {
                "id": model_id,
                "path": path.relative_to(repo_root).as_posix(),
                "bytes": actual_bytes,
                "sha256": actual_hash,
            }
        )

    for required in (DONOR_ROOT / "LICENSE.txt", DONOR_ROOT / "PROVENANCE.md"):
        if not required.is_file():
            raise RuntimeError(f"Missing donor provenance file: {required}")

    return {
        "manifestPath": DONOR_MANIFEST_PATH.relative_to(repo_root).as_posix(),
        "manifestSha256": sha256_file(DONOR_MANIFEST_PATH),
        "licenseId": source["licenseId"],
        "sourcePage": source["sourcePage"],
        "downloadedArchiveSha256": source["downloadedArchiveSha256"],
        "geometryOnly": True,
        "runtimeCollisionAuthority": False,
        "modelCount": len(verified),
        "totalDerivedBytes": sum(item["bytes"] for item in verified),
        "models": verified,
    }


def verify_portal_machine_donor(repo_root: Path) -> dict[str, Any]:
    """Fail closed on the dedicated CC0 teleporter-machine donor."""

    if not PORTAL_MACHINE_SOURCE_MANIFEST_PATH.is_file():
        raise RuntimeError(
            "Missing portal-machine source manifest: "
            f"{PORTAL_MACHINE_SOURCE_MANIFEST_PATH}"
        )
    if not PORTAL_MACHINE_DONOR_MANIFEST_PATH.is_file():
        raise RuntimeError(
            "Missing portal-machine donor manifest: "
            f"{PORTAL_MACHINE_DONOR_MANIFEST_PATH}"
        )
    source_manifest = json.loads(
        PORTAL_MACHINE_SOURCE_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    donor_manifest = json.loads(
        PORTAL_MACHINE_DONOR_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    if source_manifest.get("id") != (
        "quaternius-teleporter-base-poly-pizza-cc0"
    ):
        raise RuntimeError("Unexpected portal-machine donor identity")
    license_record = source_manifest.get("license", {})
    if license_record.get("name") != "CC0 1.0 Universal":
        raise RuntimeError("Portal-machine donor must remain CC0-1.0")
    source_geometry = source_manifest.get("geometry", {})
    if source_geometry != {
        "nodes": 2,
        "meshes": 1,
        "primitives": 3,
        "triangles": 556,
        "materials": 3,
        "images": 0,
        "textures": 0,
    }:
        raise RuntimeError("Portal-machine donor geometry contract changed")
    boundary = source_manifest.get("integrationBoundary", {})
    if boundary.get("role") != "render_only_portal_machine_donor":
        raise RuntimeError("Unexpected portal-machine donor integration role")
    if boundary.get("materialsReplaced") is not True:
        raise RuntimeError("Portal-machine donor materials must be replaced")
    for key in (
        "mayDefineCollision",
        "mayDefineTriggers",
        "mayDefineSpawns",
        "mayDefineZones",
        "mayDefineGameplayAuthority",
    ):
        if boundary.get(key) is not False:
            raise RuntimeError(
                f"Portal-machine donor authority boundary changed: {key}"
            )

    expected_files = {
        "original/Teleporter_Base.original.glb",
        "reference/Teleporter_Base.preview.jpg",
    }
    records = {
        item["path"]: item
        for item in source_manifest.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }
    if set(records) != expected_files:
        raise RuntimeError(
            "Unexpected portal-machine donor file inventory: "
            f"{sorted(records)}"
        )
    verified: list[dict[str, Any]] = []
    for relative_path in sorted(expected_files):
        record = records[relative_path]
        path = PORTAL_MACHINE_DONOR_ROOT / relative_path
        if not path.is_file():
            raise RuntimeError(f"Missing portal-machine donor file: {path}")
        actual_bytes = path.stat().st_size
        actual_hash = sha256_file(path)
        if actual_bytes != record.get("bytes"):
            raise RuntimeError(
                f"Portal-machine donor byte count changed: {relative_path}"
            )
        if actual_hash != record.get("sha256"):
            raise RuntimeError(
                f"Portal-machine donor hash changed: {relative_path}"
            )
        verified.append(
            {
                "path": path.relative_to(repo_root).as_posix(),
                "role": record.get("role"),
                "bytes": actual_bytes,
                "sha256": actual_hash,
            }
        )

    if donor_manifest.get("kind") != (
        "inkfall_rev5_cc0_portal_machine_geometry_only_manifest"
    ):
        raise RuntimeError("Unexpected portal-machine geometry-only manifest")
    donor_source = donor_manifest.get("source", {})
    if donor_source.get("licenseId") != "CC0-1.0":
        raise RuntimeError("Geometry-only portal donor must remain CC0-1.0")
    if donor_source.get("sourcePage") != source_manifest["source"]["listingUrl"]:
        raise RuntimeError("Portal-machine source page binding changed")
    original = donor_source.get("originalGlb", {})
    original_record = records["original/Teleporter_Base.original.glb"]
    if (
        original.get("bytes") != original_record.get("bytes")
        or original.get("sha256") != original_record.get("sha256")
    ):
        raise RuntimeError("Geometry-only portal donor source binding changed")
    process = donor_manifest.get("process", {})
    if (
        process.get("geometryOnly") is not True
        or process.get("materialsIncluded") is not False
        or process.get("texturesIncluded") is not False
        or process.get("animationsIncluded") is not False
        or process.get("runtimeCollisionAuthority") is not False
        or process.get("sourceMaterialsReplacedAtRuntimeBuild") is not True
    ):
        raise RuntimeError("Portal-machine derivation boundary changed")
    donor_model = donor_manifest.get("model", {})
    expected_parts = {
        "darkgrey": 222,
        "main": 238,
        "accent": 96,
    }
    actual_parts = {
        part["id"]: part["triangleCount"]
        for part in donor_model.get("parts", [])
        if isinstance(part, dict)
    }
    if (
        donor_model.get("id") != PORTAL_MACHINE_DONOR_ID
        or donor_model.get("triangleCount") != 556
        or actual_parts != expected_parts
    ):
        raise RuntimeError("Portal-machine geometry-only parts changed")
    derived = donor_model.get("derivedGeometryOnlyGlb", {})
    if (
        derived.get("name") != PORTAL_MACHINE_DONOR_PATH.name
        or derived.get("meshCount") != 3
        or derived.get("materialCount") != 0
    ):
        raise RuntimeError("Unexpected portal-machine derived GLB contract")
    if not PORTAL_MACHINE_DONOR_PATH.is_file():
        raise RuntimeError(
            f"Missing portal-machine donor GLB: {PORTAL_MACHINE_DONOR_PATH}"
        )
    actual_derived_bytes = PORTAL_MACHINE_DONOR_PATH.stat().st_size
    actual_derived_hash = sha256_file(PORTAL_MACHINE_DONOR_PATH)
    if (
        actual_derived_bytes != derived.get("bytes")
        or actual_derived_hash != derived.get("sha256")
    ):
        raise RuntimeError("Portal-machine derived GLB integrity changed")
    for required in (
        PORTAL_MACHINE_DONOR_ROOT / "LICENSE.txt",
        PORTAL_MACHINE_DONOR_ROOT / "PROVENANCE.md",
        PORTAL_MACHINE_DONOR_ROOT / "prepare_geometry_only_donor.py",
    ):
        if not required.is_file():
            raise RuntimeError(
                f"Missing portal-machine donor provenance file: {required}"
            )

    return {
        "id": source_manifest["id"],
        "sourceManifestPath": PORTAL_MACHINE_SOURCE_MANIFEST_PATH.relative_to(
            repo_root
        ).as_posix(),
        "sourceManifestSha256": sha256_file(
            PORTAL_MACHINE_SOURCE_MANIFEST_PATH
        ),
        "manifestPath": PORTAL_MACHINE_DONOR_MANIFEST_PATH.relative_to(
            repo_root
        ).as_posix(),
        "manifestSha256": sha256_file(PORTAL_MACHINE_DONOR_MANIFEST_PATH),
        "licenseId": "CC0-1.0",
        "sourcePage": source_manifest["source"]["listingUrl"],
        "modelCount": 1,
        "triangleCount": donor_model["triangleCount"],
        "derivedBytes": actual_derived_bytes,
        "derivedSha256": actual_derived_hash,
        "runtimeCollisionAuthority": False,
        "sourceMaterialsReplaced": True,
        "files": verified,
    }


def verify_portal_frame_donor(repo_root: Path) -> dict[str, Any]:
    """Fail closed on the dedicated Polygonal Mind CC0 gateway frame."""

    for manifest_path in (
        PORTAL_FRAME_SOURCE_MANIFEST_PATH,
        PORTAL_FRAME_DONOR_MANIFEST_PATH,
    ):
        if not manifest_path.is_file():
            raise RuntimeError(f"Missing portal-frame manifest: {manifest_path}")
    source_manifest = json.loads(
        PORTAL_FRAME_SOURCE_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    donor_manifest = json.loads(
        PORTAL_FRAME_DONOR_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    if source_manifest.get("id") != "polygonal-mind-abm-teleporter01-cc0":
        raise RuntimeError("Unexpected portal-frame donor identity")
    license_record = source_manifest.get("license", {})
    if license_record.get("name") != "CC0 1.0 Universal":
        raise RuntimeError("Portal-frame donor must remain CC0-1.0")
    source = source_manifest.get("source", {})
    if source.get("repositoryRevision") != (
        "56db2d4088512531a070d0bf3eb9d284d077528d"
    ):
        raise RuntimeError("Portal-frame source revision changed")
    if source_manifest.get("geometry") != {
        "nodes": 1,
        "meshes": 1,
        "primitives": 1,
        "triangles": 918,
        "derivedFrameTriangles": 688,
        "materials": 1,
        "images": 1,
        "textures": 1,
    }:
        raise RuntimeError("Portal-frame source geometry contract changed")
    boundary = source_manifest.get("integrationBoundary", {})
    if (
        boundary.get("role")
        != "render_only_portal_gateway_frame_donor"
        or boundary.get("sourceOrbRemoved") is not True
        or boundary.get("materialsReplaced") is not True
    ):
        raise RuntimeError("Unexpected portal-frame integration boundary")
    for key in (
        "mayDefineCollision",
        "mayDefineTriggers",
        "mayDefineSpawns",
        "mayDefineZones",
        "mayDefineGameplayAuthority",
    ):
        if boundary.get(key) is not False:
            raise RuntimeError(
                f"Portal-frame donor authority boundary changed: {key}"
            )

    expected_files = {
        "original/Teleporter01_Art.original.glb",
        "reference/Teleporter01_Art.thumbnail.png",
        "LICENSE.md",
    }
    records = {
        item["path"]: item
        for item in source_manifest.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }
    if set(records) != expected_files:
        raise RuntimeError(
            "Unexpected portal-frame donor inventory: "
            f"{sorted(records)}"
        )
    verified: list[dict[str, Any]] = []
    for relative_path in sorted(expected_files):
        record = records[relative_path]
        path = PORTAL_FRAME_DONOR_ROOT / relative_path
        if not path.is_file():
            raise RuntimeError(f"Missing portal-frame donor file: {path}")
        actual_bytes = path.stat().st_size
        actual_hash = sha256_file(path)
        if (
            actual_bytes != record.get("bytes")
            or actual_hash != record.get("sha256")
        ):
            raise RuntimeError(
                f"Portal-frame donor integrity changed: {relative_path}"
            )
        verified.append(
            {
                "path": path.relative_to(repo_root).as_posix(),
                "role": record.get("role"),
                "bytes": actual_bytes,
                "sha256": actual_hash,
            }
        )

    if donor_manifest.get("kind") != (
        "inkfall_rev5_cc0_portal_frame_geometry_only_manifest"
    ):
        raise RuntimeError("Unexpected portal-frame geometry-only manifest")
    donor_source = donor_manifest.get("source", {})
    if (
        donor_source.get("licenseId") != "CC0-1.0"
        or donor_source.get("repositoryRevision")
        != source.get("repositoryRevision")
    ):
        raise RuntimeError("Portal-frame source binding changed")
    original = donor_source.get("originalGlb", {})
    original_record = records["original/Teleporter01_Art.original.glb"]
    if (
        original.get("bytes") != original_record.get("bytes")
        or original.get("sha256") != original_record.get("sha256")
    ):
        raise RuntimeError("Portal-frame original GLB binding changed")
    process = donor_manifest.get("process", {})
    if (
        process.get("geometryOnly") is not True
        or process.get("sourceOrbRemoved") is not True
        or process.get("sourceCenterPlateRemoved") is not True
        or process.get("authoredLegsShortenedMeters") != 0.65
        or process.get("materialsIncluded") is not False
        or process.get("texturesIncluded") is not False
        or process.get("animationsIncluded") is not False
        or process.get("runtimeCollisionAuthority") is not False
        or process.get("sourceMaterialsReplacedAtRuntimeBuild") is not True
    ):
        raise RuntimeError("Portal-frame derivation boundary changed")
    donor_model = donor_manifest.get("model", {})
    if (
        donor_model.get("id") != PORTAL_FRAME_DONOR_ID
        or donor_model.get("sourceTriangleCount") != 918
        or donor_model.get("removedOrbTriangleCount") != 180
        or donor_model.get("removedCenterPlateTriangleCount") != 50
        or donor_model.get("triangleCount") != 688
        or donor_model.get("dimensionsMeters")
        != [1.177442, 0.175522, 2.523937]
    ):
        raise RuntimeError("Portal-frame derived geometry contract changed")
    derived = donor_model.get("derivedGeometryOnlyGlb", {})
    if (
        derived.get("name") != PORTAL_FRAME_DONOR_PATH.name
        or derived.get("meshCount") != 1
        or derived.get("materialCount") != 0
    ):
        raise RuntimeError("Unexpected portal-frame derived GLB contract")
    if not PORTAL_FRAME_DONOR_PATH.is_file():
        raise RuntimeError(
            f"Missing portal-frame donor GLB: {PORTAL_FRAME_DONOR_PATH}"
        )
    actual_derived_bytes = PORTAL_FRAME_DONOR_PATH.stat().st_size
    actual_derived_hash = sha256_file(PORTAL_FRAME_DONOR_PATH)
    if (
        actual_derived_bytes != derived.get("bytes")
        or actual_derived_hash != derived.get("sha256")
    ):
        raise RuntimeError("Portal-frame derived GLB integrity changed")
    for required in (
        PORTAL_FRAME_DONOR_ROOT / "PROVENANCE.md",
        PORTAL_FRAME_DONOR_ROOT / "prepare_geometry_only_donor.py",
    ):
        if not required.is_file():
            raise RuntimeError(
                f"Missing portal-frame donor provenance file: {required}"
            )

    return {
        "id": source_manifest["id"],
        "sourceManifestPath": PORTAL_FRAME_SOURCE_MANIFEST_PATH.relative_to(
            repo_root
        ).as_posix(),
        "sourceManifestSha256": sha256_file(
            PORTAL_FRAME_SOURCE_MANIFEST_PATH
        ),
        "manifestPath": PORTAL_FRAME_DONOR_MANIFEST_PATH.relative_to(
            repo_root
        ).as_posix(),
        "manifestSha256": sha256_file(PORTAL_FRAME_DONOR_MANIFEST_PATH),
        "licenseId": "CC0-1.0",
        "sourceRepository": source["repository"],
        "sourceRevision": source["repositoryRevision"],
        "modelCount": 1,
        "triangleCount": donor_model["triangleCount"],
        "derivedBytes": actual_derived_bytes,
        "derivedSha256": actual_derived_hash,
        "runtimeCollisionAuthority": False,
        "sourceOrbRemoved": True,
        "sourceCenterPlateRemoved": True,
        "sourceMaterialsReplaced": True,
        "files": verified,
    }


def import_geometry_donor(
    model_id: str,
    instance_name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    rotation: tuple[float, float, float],
    material: bpy.types.Material | dict[str, bpy.types.Material],
    zone: str,
    family: str,
    instance_records: list[dict[str, Any]],
    anchor: str = "base_center",
) -> list[bpy.types.Object]:
    """Import, place, re-material, and mark one non-authoritative donor."""

    if model_id in EXPECTED_DONOR_IDS:
        path = DONOR_GEOMETRY_ROOT / f"{model_id}.geometry-only.glb"
        donor_set = "quaternius_modular_scifi_megakit_standard"
        source_materials_removed = False
        if isinstance(material, dict):
            raise RuntimeError(
                f"Standard donor {model_id} cannot use part materials"
            )
        part_materials: dict[str, bpy.types.Material] | None = None
    elif model_id == PORTAL_MACHINE_DONOR_ID:
        path = PORTAL_MACHINE_DONOR_PATH
        donor_set = "quaternius_teleporter_base_poly_pizza"
        source_materials_removed = True
        if not isinstance(material, dict) or set(material) != {
            "darkgrey",
            "main",
            "accent",
        }:
            raise RuntimeError(
                "Teleporter Base requires darkgrey/main/accent materials"
            )
        part_materials = material
    elif model_id == PORTAL_FRAME_DONOR_ID:
        path = PORTAL_FRAME_DONOR_PATH
        donor_set = "polygonal_mind_abm_teleporter01"
        source_materials_removed = True
        if isinstance(material, dict):
            raise RuntimeError(
                "Polygonal Mind portal frame requires one Inkfall material"
            )
        part_materials = None
    else:
        raise RuntimeError(f"Unapproved donor model requested: {model_id}")
    before_materials = set(bpy.data.materials)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"Donor import produced no mesh: {model_id}")

    points = [
        obj.matrix_world @ Vector(corner)
        for obj in meshes
        for corner in obj.bound_box
    ]
    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    if anchor == "base_center":
        source_anchor = Vector(
            (
                (minimum.x + maximum.x) * 0.5,
                (minimum.y + maximum.y) * 0.5,
                minimum.z,
            )
        )
    elif anchor == "center":
        source_anchor = (minimum + maximum) * 0.5
    else:
        raise RuntimeError(f"Unsupported donor anchor: {anchor}")

    root = bpy.data.objects.new(f"{instance_name}_PLACEMENT", None)
    bpy.context.scene.collection.objects.link(root)
    imported_set = set(imported)
    for obj in imported:
        if obj.parent not in imported_set:
            world = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_world = world

    root.matrix_world = (
        Matrix.Translation(Vector(location))
        @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((*scale, 1.0))
        @ Matrix.Translation(-source_anchor)
    )
    # Imported glTFs commonly retain a root/child hierarchy. Force dependency
    # graph evaluation before preserving child world matrices and removing the
    # temporary placement root; otherwise Blender can return the stale
    # pre-placement matrix and silently strand donor geometry at source origin.
    bpy.context.view_layer.update()

    imported_part_ids = {
        str(obj.get("kyx_donor_part"))
        for obj in meshes
        if obj.get("kyx_donor_part") is not None
    }
    if part_materials is not None and imported_part_ids != set(part_materials):
        raise RuntimeError(
            f"Teleporter Base part inventory changed: {sorted(imported_part_ids)}"
        )

    for index, obj in enumerate(meshes):
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.name = f"{instance_name}_{index:02d}"
        obj.data.name = f"{instance_name}_MESH_{index:02d}"
        obj.data.materials.clear()
        if part_materials is None:
            obj.data.materials.append(material)
        else:
            part_id = str(obj.get("kyx_donor_part"))
            obj.data.materials.append(part_materials[part_id])
        mark_render_only(obj, zone, family)
        obj["kyx_donor_model"] = model_id
        obj["kyx_donor_license"] = "CC0-1.0"
        obj["kyx_donor_geometry_only"] = True
        obj["kyx_donor_set"] = donor_set
        obj["kyx_donor_source_materials_removed"] = source_materials_removed
        obj["kyx_donor_instance"] = instance_name

    for obj in imported:
        if obj.type != "MESH" and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)
    for imported_material in set(bpy.data.materials) - before_materials:
        if imported_material.users == 0:
            bpy.data.materials.remove(imported_material)

    final_points = [
        obj.matrix_world @ Vector(corner)
        for obj in meshes
        for corner in obj.bound_box
    ]
    final_minimum = Vector(
        (
            min(point.x for point in final_points),
            min(point.y for point in final_points),
            min(point.z for point in final_points),
        )
    )
    final_maximum = Vector(
        (
            max(point.x for point in final_points),
            max(point.y for point in final_points),
            max(point.z for point in final_points),
        )
    )
    instance_records.append(
        {
            "instance": instance_name,
            "modelId": model_id,
            "donorSet": donor_set,
            "zone": zone,
            "family": family,
            "meshCount": len(meshes),
            "partIds": sorted(imported_part_ids),
            "boundsMinimumMeters": [
                round(final_minimum.x, 4),
                round(final_minimum.y, 4),
                round(final_minimum.z, 4),
            ],
            "boundsMaximumMeters": [
                round(final_maximum.x, 4),
                round(final_maximum.y, 4),
                round(final_maximum.z, 4),
            ],
            "renderOnly": True,
            "collisionAuthority": False,
            "sourceMaterialsRemoved": source_materials_removed,
        }
    )
    return meshes


def tune_material_values(
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    values = rev4.tune_rev4_material_values(materials)
    overrides = {
        "V3_USED_CERAMIC": ((0.50, 0.52, 0.52, 1.0), 0.02, 0.62),
        "V3_WORN_STEEL": ((0.26, 0.315, 0.325, 1.0), 0.46, 0.43),
        "V3_CAST_IRON": ((0.13, 0.17, 0.18, 1.0), 0.34, 0.50),
        "V3_INK_BLACK": ((0.055, 0.08, 0.09, 1.0), 0.10, 0.63),
        "V3_AQUA_INDICATOR": ((0.05, 0.62, 0.69, 1.0), 0.12, 0.25),
        "V3_WORN_AMBER": ((0.76, 0.40, 0.07, 1.0), 0.18, 0.36),
    }
    for name, (color, metallic, roughness) in overrides.items():
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
        values[name] = {
            "baseColorLinear": list(color),
            "metallic": metallic,
            "roughness": roughness,
        }
    return values


def remove_low_orphan_parent_components(
    parent_meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    """Remove the disconnected portable-clutter family from review context.

    This operates only on the in-memory derivative review context. Large
    architectural components and floor plates remain; small detached rails,
    stools, bars, target crescents, and wall/floor trim are removed together.
    The frozen parent source on disk is retained.
    """

    floor_levels = (-3.0, 0.0, 6.0)
    removed: list[dict[str, Any]] = []
    for obj in parent_meshes:
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        unvisited = set(bm.verts)
        components: list[list[bmesh.types.BMVert]] = []
        while unvisited:
            seed = unvisited.pop()
            component = [seed]
            stack = [seed]
            while stack:
                vertex = stack.pop()
                for edge in vertex.link_edges:
                    neighbor = edge.other_vert(vertex)
                    if neighbor not in unvisited:
                        continue
                    unvisited.remove(neighbor)
                    component.append(neighbor)
                    stack.append(neighbor)
            components.append(component)

        delete_vertices: list[bmesh.types.BMVert] = []
        for component_index, component in enumerate(components):
            points = [obj.matrix_world @ vertex.co for vertex in component]
            minimum = Vector((
                min(point.x for point in points),
                min(point.y for point in points),
                min(point.z for point in points),
            ))
            maximum = Vector((
                max(point.x for point in points),
                max(point.y for point in points),
                max(point.z for point in points),
            ))
            size = maximum - minimum
            center = (minimum + maximum) * 0.5
            planar_max = max(size.x, size.y)
            planar_min = min(size.x, size.y)
            nearest_floor_delta = min(
                abs(minimum.z - floor) for floor in floor_levels
            )
            anchored_foreground_rail = (
                obj.name == "V33OPT_SOUTH_V3_WORN_STEEL"
                and -7.8 <= center.x <= 7.8
                and -4.95 <= center.y <= -4.55
                and maximum.z <= 2.8
            )
            low_disconnected_prop = (
                size.z <= 2.6
                and planar_max <= 4.6
                and planar_min <= 2.8
                and not anchored_foreground_rail
            )
            if not low_disconnected_prop:
                continue
            delete_vertices.extend(component)
            removed.append({
                "parentObject": obj.name,
                "componentIndex": component_index,
                "vertexCount": len(component),
                "boundsMinimumMeters": [
                    round(minimum.x, 4),
                    round(minimum.y, 4),
                    round(minimum.z, 4),
                ],
                "boundsMaximumMeters": [
                    round(maximum.x, 4),
                    round(maximum.y, 4),
                    round(maximum.z, 4),
                ],
                "nearestFloorDeltaMeters": round(nearest_floor_delta, 4),
            })
        if delete_vertices:
            bmesh.ops.delete(bm, geom=delete_vertices, context="VERTS")
            bm.to_mesh(mesh)
            mesh.update()
        bm.free()
    return {
        "kind": "derivative_review_context_portable_clutter_family_cleanup",
        "removedComponentCount": len(removed),
        "removedComponents": removed,
        "frozenParentSourceModified": False,
        "authorityGeometryModified": False,
    }


def carve_continuous_clearance(
    parent_meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    """Open continuous, overlapping corridor and portal apertures in context art."""

    cutters: list[bpy.types.Object] = []
    for index, (start, end) in enumerate(zip(
        TRAVERSAL_CLEARANCE_POINTS,
        TRAVERSAL_CLEARANCE_POINTS[1:],
    )):
        horizontal = Vector((end[0] - start[0], end[1] - start[1], 0.0))
        center = interpolate(start, end, 0.5)
        bpy.ops.mesh.primitive_cube_add(
            location=(center[0], center[1], center[2] + 1.9),
            rotation=(0.0, 0.0, math.atan2(horizontal.y, horizontal.x)),
        )
        cutter = bpy.context.object
        cutter.name = f"V5_ROUTE_CLEARANCE_CONTINUOUS_{index}"
        cutter.dimensions = (
            horizontal.length + 1.4,
            ROUTE_CLEAR_WIDTH_METERS,
            ROUTE_CLEAR_HEIGHT_METERS,
        )
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        cutters.append(cutter)

    for endpoint in PORTAL_ENDPOINTS:
        center = endpoint["visualCenterBlenderMeters"]
        bpy.ops.mesh.primitive_cube_add(location=center)
        cutter = bpy.context.object
        cutter.name = f"V5_PORTAL_CLEARANCE_{endpoint['id'].upper()}"
        # Clear a real sight/traversal tube on both sides of the no-hit ring.
        # This prevents a wall or detached machine island from backing the
        # aperture and keeps the presentation distinct from a wall medallion.
        cutter.dimensions = (4.5, 10.0, 4.2)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        cutters.append(cutter)

    bpy.ops.object.select_all(action="DESELECT")
    for cutter in cutters:
        cutter.select_set(True)
    joined = cutters[0]
    bpy.context.view_layer.objects.active = joined
    bpy.ops.object.join()
    joined.name = "V5_CONTINUOUS_PRESENTATION_CLEARANCE_ONLY"

    affected: list[dict[str, Any]] = []
    for obj in parent_meshes:
        before = rev4.mesh_triangles(obj)
        modifier = obj.modifiers.new(name="V5_CONTINUOUS_CLEARANCE", type="BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = joined
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError as cause:
            obj.select_set(False)
            raise RuntimeError(f"Rev5 clearance boolean failed for {obj.name}") from cause
        obj.select_set(False)
        after = rev4.mesh_triangles(obj)
        if before != after:
            affected.append(
                {
                    "object": obj.name,
                    "trianglesBefore": before,
                    "trianglesAfter": after,
                }
            )
    bpy.data.objects.remove(joined, do_unlink=True)
    return {
        "kind": "continuous_derivative_presentation_clearance",
        "routeClearWidthMeters": ROUTE_CLEAR_WIDTH_METERS,
        "routeClearHeightMeters": ROUTE_CLEAR_HEIGHT_METERS,
        "routeCutterCount": len(TRAVERSAL_CLEARANCE_POINTS) - 1,
        "portalApertureCount": len(PORTAL_ENDPOINTS),
        "affectedParentMeshes": affected,
        "frozenParentSourceModified": False,
        "authorityGeometryModified": False,
    }


def add_support_pair(
    segment_token: str,
    sample: tuple[float, float, float],
    side: Vector,
    materials: dict[str, bpy.types.Material],
    sample_token: str,
) -> int:
    cast = materials["V3_CAST_IRON"]
    steel = materials["V3_WORN_STEEL"]
    zone = "archive_rise"
    top_z = sample[2] - 0.18
    base_z = 0.02
    if top_z - base_z <= 0.35:
        return 0
    left = offset_point(
        sample,
        side,
        -BRIDGE_SECTION["supportOffsetMeters"],
    )
    right = offset_point(
        sample,
        side,
        BRIDGE_SECTION["supportOffsetMeters"],
    )
    for side_token, point in (("L", left), ("R", right)):
        add_box(
            f"V5_BRIDGE_{segment_token}_PIER_{sample_token}_{side_token}",
            (0.52, 0.52, top_z - base_z),
            (point[0], point[1], (base_z + top_z) * 0.5),
            cast,
            zone,
            "load_pier",
            bevel=0.055,
        )
        add_box(
            f"V5_BRIDGE_{segment_token}_FOOT_{sample_token}_{side_token}",
            (0.90, 0.90, 0.20),
            (point[0], point[1], base_z + 0.08),
            steel,
            zone,
            "load_pier",
            bevel=0.065,
        )
    add_beam(
        f"V5_BRIDGE_{segment_token}_SUPPORT_CROSS_{sample_token}",
        (left[0], left[1], top_z - 0.04),
        (right[0], right[1], top_z - 0.04),
        0.15,
        steel,
        zone,
        "load_pier_cap",
        vertices=12,
    )
    return 5


def build_connected_bridge(
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    ceramic = materials["V3_USED_CERAMIC"]
    ink = materials["V3_INK_BLACK"]
    steel = materials["V3_WORN_STEEL"]
    cast = materials["V3_CAST_IRON"]
    amber = materials["V3_WORN_AMBER"]
    aqua = materials["V3_AQUA_INDICATOR"]
    zone = "archive_rise"
    support_count = 0
    joint_count = 0
    rail_post_count = 0

    for segment_index, (start, end) in enumerate(zip(ROUTE_POINTS, ROUTE_POINTS[1:])):
        side = path_side(start, end)
        token = f"S{segment_index:02d}"
        add_path_slab(
            f"V5_BRIDGE_{token}_PRIMARY_DECK",
            start,
            end,
            BRIDGE_SECTION["deckWidthMeters"],
            0.24,
            cast,
            zone,
            "primary_deck",
        )
        for band_index, band_offset in enumerate((-0.52, 0.52)):
            add_path_slab(
                f"V5_BRIDGE_{token}_TREAD_{band_index}",
                offset_point(start, side, band_offset),
                offset_point(end, side, band_offset),
                0.93,
                0.045,
                ceramic,
                zone,
                "route_tread",
            )
        add_path_slab(
            f"V5_BRIDGE_{token}_CENTER_DATUM",
            start,
            end,
            0.09,
            0.025,
            ink,
            zone,
            "drainage_seam",
        )

        for side_index, sign in enumerate((-1.0, 1.0)):
            edge_start = offset_point(
                start,
                side,
                sign * BRIDGE_SECTION["edgeGirderOffsetMeters"],
            )
            edge_end = offset_point(
                end,
                side,
                sign * BRIDGE_SECTION["edgeGirderOffsetMeters"],
            )
            add_path_slab(
                f"V5_BRIDGE_{token}_EDGE_GIRDER_{side_index}",
                (edge_start[0], edge_start[1], edge_start[2] - 0.06),
                (edge_end[0], edge_end[1], edge_end[2] - 0.06),
                0.24,
                0.46,
                steel,
                zone,
                "edge_girder",
            )
            for rail_level, height in (("MID", 0.52), ("TOP", 1.06)):
                add_beam(
                    f"V5_BRIDGE_{token}_{rail_level}_RAIL_{side_index}",
                    (edge_start[0], edge_start[1], edge_start[2] + height),
                    (edge_end[0], edge_end[1], edge_end[2] + height),
                    (
                        BRIDGE_SECTION["maximumRailRadiusMeters"]
                        if rail_level == "TOP"
                        else 0.036
                    ),
                    steel if rail_level == "TOP" else (aqua if sign < 0 else amber),
                    zone,
                    "attached_guard_rail",
                    vertices=14,
                )
            # Posts only at structural segment boundaries keep the continuous
            # rails safe while opening combat sightlines. Mid-span pickets read
            # as construction scaffold rather than finished bridge hardware.
            fractions = (0.0, 1.0)
            if segment_index > 0:
                fractions = fractions[1:]
            for post_index, fraction in enumerate(fractions):
                sample = interpolate(edge_start, edge_end, fraction)
                add_beam(
                    f"V5_BRIDGE_{token}_RAIL_POST_{side_index}_{post_index}",
                    (sample[0], sample[1], sample[2] - 0.08),
                    (sample[0], sample[1], sample[2] + 1.08),
                    0.065,
                    cast,
                    zone,
                    "attached_guard_post",
                )
                rail_post_count += 1

        # One centered load frame per span is enough to show a credible load
        # path. The previous two-pair cadence filled combat lanes with a forest
        # of thin posts and repeated feet.
        for support_index, fraction in enumerate((0.5,)):
            sample = interpolate(start, end, fraction)
            support_count += add_support_pair(
                token,
                sample,
                side,
                materials,
                f"P{support_index}",
            )

    for joint_index, point in enumerate(ROUTE_POINTS[1:-1], start=1):
        incoming = path_side(ROUTE_POINTS[joint_index - 1], point)
        outgoing = path_side(point, ROUTE_POINTS[joint_index + 1])
        side = (incoming + outgoing).normalized()
        left = offset_point(point, side, -1.27)
        right = offset_point(point, side, 1.27)
        add_beam(
            f"V5_BRIDGE_JOINT_{joint_index}_SILL",
            (left[0], left[1], left[2] - 0.12),
            (right[0], right[1], right[2] - 0.12),
            0.11,
            steel,
            zone,
            "miter_joint_collar",
        )
        for token, endpoint in (("L", left), ("R", right)):
            add_box(
                f"V5_BRIDGE_JOINT_{joint_index}_FRAME_POST_{token}",
                (0.36, 0.36, 2.78),
                (endpoint[0], endpoint[1], endpoint[2] + 1.31),
                cast,
                zone,
                "rooted_transition_frame",
                bevel=0.045,
            )
            add_box(
                f"V5_BRIDGE_JOINT_{joint_index}_FRAME_SHOE_{token}",
                (0.78, 0.78, 0.20),
                (endpoint[0], endpoint[1], endpoint[2] + 0.02),
                steel,
                zone,
                "rooted_transition_frame",
                bevel=0.055,
            )
        add_beam(
            f"V5_BRIDGE_JOINT_{joint_index}_FRAME_CROWN",
            (left[0], left[1], left[2] + 2.62),
            (right[0], right[1], right[2] + 2.62),
            0.17,
            cast,
            zone,
            "rooted_transition_frame",
            vertices=14,
        )
        joint_count += 6

    return {
        "segmentCount": len(ROUTE_POINTS) - 1,
        "supportComponentCount": support_count,
        "jointComponentCount": joint_count,
        "railPostCount": rail_post_count,
        "continuousPrimaryDeck": True,
        "railsRootedToDeckGirders": True,
        "transitionFramesRootedToDeck": True,
    }


def build_supported_landing(
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    ceramic = materials["V3_USED_CERAMIC"]
    ink = materials["V3_INK_BLACK"]
    steel = materials["V3_WORN_STEEL"]
    cast = materials["V3_CAST_IRON"]
    amber = materials["V3_WORN_AMBER"]
    paper = materials["V3_GARDEN_FRAGMENT"]
    grease = materials["V3_GREASED_LINKAGE"]
    zone = "archive_landing"

    add_box(
        "V5_ARCHIVE_LANDING_PRIMARY_DECK",
        LANDING_SIZE,
        LANDING_CENTER,
        steel,
        zone,
        "landing_deck",
        bevel=0.035,
    )
    for x in (-24.8, -22.0, -19.2):
        add_box(
            f"V5_ARCHIVE_UNDERDECK_GIRDER_{x}",
            (0.34, 6.72, 0.44),
            (x, 19.0, 5.48),
            cast,
            zone,
            "landing_understructure",
            bevel=0.025,
        )
    for y in (16.2, 19.0, 21.8):
        add_box(
            f"V5_ARCHIVE_UNDERDECK_CROSS_{y}",
            (7.72, 0.32, 0.34),
            (-22.0, y, 5.40),
            steel,
            zone,
            "landing_understructure",
            bevel=0.022,
        )

    support_points = (
        (-25.35, 16.2),
        (-18.65, 16.2),
        (-25.35, 21.8),
        (-18.65, 21.8),
    )
    for index, (x, y) in enumerate(support_points):
        add_beam(
            f"V5_ARCHIVE_SUPPORT_COLUMN_{index}",
            (x, y, 0.02),
            (x, y, 5.42),
            0.12,
            cast,
            zone,
            "landing_load_support",
        )
        add_box(
            f"V5_ARCHIVE_SUPPORT_FOOT_{index}",
            (0.58, 0.58, 0.16),
            (x, y, 0.10),
            steel,
            zone,
            "landing_load_support",
            bevel=0.03,
        )
    for token, start, end in (
        ("SW_NE", (-25.35, 16.2, 0.18), (-18.65, 21.8, 5.25)),
        ("SE_NW", (-18.65, 16.2, 0.18), (-25.35, 21.8, 5.25)),
    ):
        add_beam(
            f"V5_ARCHIVE_UNDERDECK_BRACE_{token}",
            start,
            end,
            0.085,
            cast,
            zone,
            "landing_load_support",
        )

    for index, x in enumerate((-25.0, -23.0, -21.0, -19.0)):
        add_box(
            f"V5_ARCHIVE_FLOOR_SEAM_X_{index}",
            (0.055, 6.55, 0.024),
            (x, 19.0, 6.012),
            ink,
            zone,
            "floor_seam",
            bevel=0.006,
        )
    for index, y in enumerate((16.4, 18.1, 19.8, 21.5)):
        add_box(
            f"V5_ARCHIVE_FLOOR_SEAM_Y_{index}",
            (7.55, 0.055, 0.024),
            (-22.0, y, 6.012),
            ink,
            zone,
            "floor_seam",
            bevel=0.006,
        )

    # A rooted overhead service gantry replaces the Rev4 floating trim.
    gantry_points = (
        (-25.45, 16.1),
        (-18.55, 16.1),
        (-25.45, 21.9),
        (-18.55, 21.9),
    )
    for index, (x, y) in enumerate(gantry_points):
        add_beam(
            f"V5_ARCHIVE_GANTRY_POST_{index}",
            (x, y, 6.0),
            (x, y, 10.35),
            0.10,
            cast,
            zone,
            "rooted_archive_gantry",
        )
        add_box(
            f"V5_ARCHIVE_GANTRY_SHOE_{index}",
            (0.5, 0.5, 0.17),
            (x, y, 6.085),
            steel,
            zone,
            "rooted_archive_gantry",
            bevel=0.03,
        )
    for token, start, end in (
        ("S", (-25.45, 16.1, 10.3), (-18.55, 16.1, 10.3)),
        ("N", (-25.45, 21.9, 10.3), (-18.55, 21.9, 10.3)),
        ("W", (-25.45, 16.1, 10.3), (-25.45, 21.9, 10.3)),
        ("E", (-18.55, 16.1, 10.3), (-18.55, 21.9, 10.3)),
    ):
        add_beam(
            f"V5_ARCHIVE_GANTRY_CROWN_{token}",
            start,
            end,
            0.105,
            cast,
            zone,
            "rooted_archive_gantry",
        )
    for x in (-24.2, -19.7):
        add_beam(
            f"V5_ARCHIVE_GANTRY_CROSS_{x}",
            (x, 16.1, 10.23),
            (x, 21.9, 10.23),
            0.062,
            steel,
            zone,
            "rooted_archive_gantry",
        )

    rack_centers = (
        (-25.0, 18.2, 7.45),
        (-25.0, 20.45, 7.45),
        (-19.0, 20.45, 7.45),
    )
    for rack_index, (x, y, z) in enumerate(rack_centers):
        for offset in (-0.48, 0.48):
            add_box(
                f"V5_ARCHIVE_RACK_{rack_index}_POST_{offset}",
                (0.12, 0.44, 2.8),
                (x + offset, y, z),
                cast,
                zone,
                "rooted_archive_rack",
                bevel=0.022,
            )
        for shelf_index, shelf_z in enumerate((6.22, 7.08, 7.94, 8.8)):
            add_box(
                f"V5_ARCHIVE_RACK_{rack_index}_SHELF_{shelf_index}",
                (1.16, 0.58, 0.09),
                (x, y, shelf_z),
                steel,
                zone,
                "rooted_archive_rack",
                bevel=0.016,
            )
        for roll_index, (offset, roll_z) in enumerate(
            ((-0.26, 6.62), (0.26, 6.62), (-0.26, 7.48), (0.26, 7.48), (0.0, 8.34))
        ):
            add_cylinder(
                f"V5_ARCHIVE_LEDGER_{rack_index}_{roll_index}",
                0.24,
                0.44,
                (x + offset, y - 0.02, roll_z),
                paper,
                zone,
                "paper_ledger",
                rotation=(math.pi / 2.0, 0.0, 0.0),
                vertices=20,
                bevel=0.012,
            )
            add_cylinder(
                f"V5_ARCHIVE_LEDGER_HUB_{rack_index}_{roll_index}",
                0.07,
                0.48,
                (x + offset, y - 0.02, roll_z),
                grease,
                zone,
                "paper_ledger_hub",
                rotation=(math.pi / 2.0, 0.0, 0.0),
                vertices=14,
                bevel=0.008,
            )

    # Segmented north wall now rests directly on the landing top.
    for panel_index, x in enumerate((-24.55, -22.0, -19.45)):
        add_box(
            f"V5_ARCHIVE_NORTH_SERVICE_PANEL_{panel_index}",
            (2.28, 0.18, 3.5),
            (x, 22.4, 7.75),
            ink if panel_index == 1 else ceramic,
            zone,
            "supported_context_wall",
            bevel=0.035,
        )
        add_box(
            f"V5_ARCHIVE_NORTH_PANEL_DATUM_{panel_index}",
            (1.78, 0.08, 0.09),
            (x, 22.3, 9.24),
            amber if panel_index == 1 else steel,
            zone,
            "attached_wall_datum",
            bevel=0.015,
        )

    return {
        "supportColumnCount": len(support_points),
        "underdeckBraceCount": 2,
        "gantryPostCount": len(gantry_points),
        "contextWallBaseMeters": 6.0,
        "landingFloorTopMeters": 6.0,
        "allPrimaryLoadsReachFoundationOrDeck": True,
    }


def build_cc0_donor_service_language(
    materials: dict[str, bpy.types.Material],
    instance_records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Add a restrained, re-materialed construction/detail vocabulary."""

    start_count = len(instance_records)
    steel = materials["V3_WORN_STEEL"]
    cast = materials["V3_CAST_IRON"]
    ceramic = materials["V3_USED_CERAMIC"]
    aqua = materials["V3_AQUA_INDICATOR"]
    amber = materials["V3_WORN_AMBER"]

    import_geometry_donor(
        "Platform_Metal2",
        "V5_DONOR_ARCHIVE_FLOOR_INSERT",
        (-22.0, 19.0, 6.022),
        (1.62, 1.62, 1.62),
        (0.0, 0.0, 0.0),
        ceramic,
        "archive_landing",
        "donor_landing_floor_insert",
        instance_records,
    )

    for joint_index, point in enumerate(ROUTE_POINTS[1:-1], start=1):
        previous = ROUTE_POINTS[joint_index - 1]
        following = ROUTE_POINTS[joint_index + 1]
        tangent = Vector(
            (
                following[0] - previous[0],
                following[1] - previous[1],
                0.0,
            )
        ).normalized()
        tangent_angle = math.atan2(tangent.y, tangent.x)
        # The rooted procedural joint frame already carries this load. The
        # former four donor trusses duplicated its silhouette and read as
        # detached scaffold clutter from the player route.
        import_geometry_donor(
            "Prop_Light_Wide",
            f"V5_DONOR_BRIDGE_JOINT_{joint_index}_CROWN_LIGHT",
            (point[0], point[1], point[2] + 2.48),
            (1.1, 1.1, 1.1),
            (0.0, 0.0, tangent_angle + math.pi / 2.0),
            amber,
            "archive_rise",
            "donor_attached_route_light",
            instance_records,
            anchor="center",
        )

    for index, x in enumerate((-24.75, -19.25)):
        import_geometry_donor(
            "Column_Pipes",
            f"V5_DONOR_ARCHIVE_PIPE_RISER_{index}",
            (x, 22.12, 6.02),
            (0.62, 0.62, 0.62),
            (0.0, 0.0, 0.0),
            steel,
            "archive_landing",
            "donor_rooted_service_riser",
            instance_records,
        )

    import_geometry_donor(
        "Prop_PipeHolder",
        "V5_DONOR_ARCHIVE_PIPE_BANK",
        (-24.0, 21.72, 6.025),
        (0.72, 0.72, 0.72),
        (0.0, 0.0, 0.0),
        cast,
        "archive_landing",
        "donor_rooted_service_bank",
        instance_records,
    )
    import_geometry_donor(
        "Prop_AccessPoint",
        "V5_DONOR_ARCHIVE_ACCESS_TERMINAL",
        (-19.45, 21.35, 6.025),
        (1.05, 1.05, 1.05),
        (0.0, 0.0, math.pi),
        aqua,
        "archive_landing",
        "donor_rooted_access_terminal",
        instance_records,
    )
    import_geometry_donor(
        "Prop_Vent_Wide",
        "V5_DONOR_ARCHIVE_WALL_VENT",
        (-22.0, 22.19, 8.55),
        (1.35, 1.35, 1.35),
        (math.pi / 2.0, 0.0, 0.0),
        steel,
        "archive_landing",
        "donor_attached_wall_service",
        instance_records,
        anchor="center",
    )

    added = instance_records[start_count:]
    return {
        "instanceCount": len(added),
        "modelIds": sorted({item["modelId"] for item in added}),
        "zones": sorted({item["zone"] for item in added}),
        "projectAuthoredMaterialsOnly": True,
        "runtimeCollisionAuthority": False,
        "instances": added,
    }


def portal_energy_material(
    endpoint_id: str,
    base: bpy.types.Material,
) -> bpy.types.Material:
    material = base.copy()
    material.name = f"V5_PORTAL_ENERGY_{endpoint_id.upper()}"
    color = tuple(base.diffuse_color[:3]) + (0.30,)
    material.diffuse_color = color
    if material.use_nodes:
        principled = material.node_tree.nodes.get("Principled BSDF")
        if principled is not None:
            principled.inputs["Base Color"].default_value = color
            principled.inputs["Alpha"].default_value = 0.30
            emission_color = principled.inputs.get("Emission Color")
            if emission_color is not None:
                emission_color.default_value = tuple(color[:3]) + (1.0,)
            emission_strength = principled.inputs.get("Emission Strength")
            if emission_strength is not None:
                emission_strength.default_value = 1.40
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    material.use_backface_culling = False
    material["kyx_role"] = "translucent_energy_surface_render_only"
    material["kyx_collision"] = False
    material["kyx_authority"] = False
    return material


def add_portal_energy_field(
    name: str,
    center: Vector,
    radius: float,
    material: bpy.types.Material,
    zone: str,
) -> bpy.types.Object:
    """Create one connected translucent field inside the authored gateway."""

    segment_count = 12
    vertices = [(center.x, center.y + 0.018, center.z)]
    vertices.extend(
        (
            center.x + math.cos(math.tau * index / segment_count) * radius,
            center.y + 0.018,
            center.z + math.sin(math.tau * index / segment_count) * radius,
        )
        for index in range(segment_count)
    )
    faces = [
        (0, index + 1, ((index + 1) % segment_count) + 1)
        for index in range(segment_count)
    ]
    mesh_data = bpy.data.meshes.new(f"{name}_MESH")
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.update()
    mesh_data.materials.append(material)
    field = bpy.data.objects.new(name, mesh_data)
    bpy.context.scene.collection.objects.link(field)
    field["kyx_translucent_field"] = True
    field["kyx_field_segment_count"] = segment_count
    return mark_render_only(
        field,
        zone,
        "portal_energy_filament_vfx_hook",
    )


def add_portal_energy_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    zone: str,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_CURVE", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 3
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new(type="BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.scene.collection.objects.link(obj)
    curve_data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    mesh = bpy.context.object
    mesh.name = name
    return mark_render_only(
        mesh,
        zone,
        "portal_energy_filament_vfx_hook",
    )


def build_portal_endpoint(
    endpoint: dict[str, Any],
    materials: dict[str, bpy.types.Material],
    instance_records: list[dict[str, Any]],
) -> dict[str, Any]:
    zone = f"portal_{endpoint['id']}"
    center = Vector(endpoint["visualCenterBlenderMeters"])
    floor = endpoint["floorTopBlenderMeters"]
    color = materials[endpoint["colorMaterial"]]
    cast = materials["V3_CAST_IRON"]
    steel = materials["V3_WORN_STEEL"]
    ink = materials["V3_INK_BLACK"]
    safety = materials["V3_CHIPPED_SAFETY_RED"]
    energy = portal_energy_material(endpoint["id"], color)

    endpoint_token = endpoint["id"].upper()
    import_geometry_donor(
        PORTAL_MACHINE_DONOR_ID,
        f"V5_DONOR_PORTAL_{endpoint_token}_MACHINE_BASE",
        (center.x, center.y, floor - 0.3023),
        (1.35, 1.35, 1.0),
        (0.0, 0.0, 0.0),
        {
            "darkgrey": cast,
            "main": steel,
            "accent": color,
        },
        zone,
        "donor_portal_teleporter_base",
        instance_records,
    )
    frame_meshes = import_geometry_donor(
        PORTAL_FRAME_DONOR_ID,
        f"V5_DONOR_PORTAL_{endpoint_token}_FRAME",
        (center.x, center.y, floor - 1.293),
        (2.48, 3.0, 1.65),
        (0.0, 0.0, 0.0),
        steel,
        zone,
        "authoritative_portal_landmark",
        instance_records,
    )
    for frame in frame_meshes:
        frame["kyx_portal_endpoint_id"] = endpoint["id"]
        frame["kyx_portal_partner_id"] = endpoint["partnerId"]
        frame["kyx_portal_authority_capability"] = AUTHORITY_PORTAL_CAPABILITY

    import_geometry_donor(
        "Prop_Light_Wide",
        f"V5_DONOR_PORTAL_{endpoint_token}_HEADER_LIGHT",
        (center.x, center.y - 0.31, floor + 2.58),
        (1.12, 1.12, 1.12),
        (0.0, 0.0, 0.0),
        color,
        zone,
        "donor_portal_header_light",
        instance_records,
        anchor="center",
    )
    import_geometry_donor(
        "Prop_AccessPoint",
        f"V5_DONOR_PORTAL_{endpoint_token}_ACCESS",
        (center.x + 2.05, center.y + 0.78, floor + 0.022),
        (1.0, 1.0, 1.0),
        (0.0, 0.0, math.pi),
        color,
        zone,
        "donor_portal_access_terminal",
        instance_records,
    )

    # The field, guide rings, and turbine arms form one connected aperture.
    # The translucent dodecagonal field eliminates the black-center/floating
    # ring reading without becoming an opaque billboard.
    energy_objects: list[bpy.types.Object] = [
        add_portal_energy_field(
            f"V5_PORTAL_{endpoint_token}_ACTIVE_FIELD",
            center,
            1.04,
            energy,
            zone,
        )
    ]
    guide_ring_specs = (
        (1.10, 0.045),
        (0.69, 0.022),
    )
    for ring_index, (major_radius, minor_radius) in enumerate(guide_ring_specs):
        energy_objects.append(
            add_torus(
                f"V5_PORTAL_{endpoint_token}_GUIDE_RING_{ring_index}",
                major_radius,
                minor_radius,
                (center.x, center.y + 0.034, center.z),
                energy,
                zone,
                "portal_energy_filament_vfx_hook",
                rotation=(math.pi / 2.0, 0.0, 0.0),
            )
        )
    for filament_index in range(6):
        outer_angle = math.tau * filament_index / 6.0
        curve_points: list[tuple[float, float, float]] = []
        for step in range(6):
            fraction = step / 5.0
            radius = 1.08 * (1.0 - fraction) + 0.30 * fraction
            angle = outer_angle + fraction * 0.72
            curve_points.append(
                (
                    center.x + math.cos(angle) * radius,
                    center.y + 0.026 + fraction * 0.014,
                    center.z + math.sin(angle) * radius,
                )
            )
        energy_objects.append(
            add_portal_energy_curve(
                f"V5_PORTAL_{endpoint_token}_VORTEX_ARM_{filament_index}",
                curve_points,
                0.018,
                energy,
                zone,
            )
        )

    for surface in energy_objects:
        surface["kyx_vfx_departure_hook"] = (
            f"inkfall.portal.{endpoint['id']}.energy_departure"
        )
        surface["kyx_vfx_arrival_hook"] = (
            f"inkfall.portal.{endpoint['id']}.energy_arrival"
        )
        surface["kyx_audio_departure_hook"] = (
            f"inkfall.portal.{endpoint['id']}.departure"
        )
        surface["kyx_audio_arrival_hook"] = (
            f"inkfall.portal.{endpoint['id']}.arrival"
        )

    for side_index, sign in enumerate((-1.0, 1.0)):
        x = center.x + sign * 1.66
        add_box(
            f"V5_PORTAL_{endpoint_token}_PLINTH_{side_index}",
            (0.68, 0.86, 0.20),
            (x, center.y, floor + 0.10),
            steel,
            zone,
            "portal_grounded_plinth",
            bevel=0.045,
        )
        add_box(
            f"V5_PORTAL_{endpoint_token}_SIDE_PIER_{side_index}",
            (0.34, 0.58, 1.28),
            (x, center.y, floor + 0.72),
            cast,
            zone,
            "portal_grounded_pier",
            bevel=0.035,
        )
        add_box(
            f"V5_PORTAL_{endpoint_token}_SIDE_DATUM_{side_index}",
            (0.11, 0.60, 0.48),
            (x - sign * 0.18, center.y - 0.01, floor + 0.78),
            safety,
            zone,
            "portal_attached_hazard_datum",
            bevel=0.018,
        )

    # Exit-side chevrons make the intended arrival direction readable.
    exit_blender = Vector(map_mm_to_blender(endpoint["exitFeetMapMm"]))
    direction = Vector((exit_blender.x - center.x, exit_blender.y - center.y, 0.0))
    if direction.length > 1e-6:
        direction.normalize()
        side = Vector((-direction.y, direction.x, 0.0))
        for chevron_index in range(3):
            origin = Vector((center.x, center.y, floor + 0.035))
            origin += direction * (2.2 + chevron_index * 0.58)
            left = origin - direction * 0.25 + side * 0.32
            right = origin - direction * 0.25 - side * 0.32
            tip = origin + direction * 0.28
            add_beam(
                f"V5_PORTAL_{endpoint_token}_EXIT_CHEVRON_{chevron_index}_L",
                tuple(left),
                tuple(tip),
                0.055,
                color,
                zone,
                "portal_exit_wayfinding",
                vertices=12,
            )
            add_beam(
                f"V5_PORTAL_{endpoint_token}_EXIT_CHEVRON_{chevron_index}_R",
                tuple(right),
                tuple(tip),
                0.055,
                color,
                zone,
                "portal_exit_wayfinding",
                vertices=12,
            )

    return {
        "id": endpoint["id"],
        "partnerId": endpoint["partnerId"],
        "triggerCenterMapMm": list(endpoint["triggerCenterMapMm"]),
        "triggerHalfExtentsMapMm": list(endpoint["triggerHalfExtentsMapMm"]),
        "exitFeetMapMm": list(endpoint["exitFeetMapMm"]),
        "exitYawMilliDegrees": endpoint["exitYawMilliDegrees"],
        "visualCenterBlenderMeters": list(endpoint["visualCenterBlenderMeters"]),
        "groundedSupportCount": 4,
        "donorGatewayFrameCount": 1,
        "donorTeleporterBaseCount": 1,
        "energyGuideRingCount": len(guide_ring_specs),
        "translucentEnergyFieldCount": 1,
        "energyFilamentCount": len(energy_objects),
        "exitChevronCount": 3,
        "noOpaqueEnergyBillboard": True,
        "renderOnly": True,
    }


def build_portal_pair(
    materials: dict[str, bpy.types.Material],
    instance_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        build_portal_endpoint(endpoint, materials, instance_records)
        for endpoint in PORTAL_ENDPOINTS
    ]


def join_rev5_meshes() -> list[dict[str, Any]]:
    joined = rev4.join_new_meshes_by_zone_and_material()
    for item in joined:
        obj = bpy.data.objects.get(item["name"])
        if obj is None:
            raise RuntimeError(f"Joined Rev5 object missing: {item['name']}")
        old_name = obj.name
        obj.name = old_name.replace("V4OPT_", "V5OPT_", 1)
        item["name"] = obj.name
    return joined


def add_point_light(
    name: str,
    location: tuple[float, float, float],
    color: tuple[float, float, float],
    energy: float,
    radius: float,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=name, type="POINT")
    data.color = color
    data.energy = energy
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "review_light"
    bpy.context.collection.objects.link(obj)
    return obj


def configure_review_scene() -> dict[str, bpy.types.Object]:
    cameras = rev4.configure_review_scene()
    for light_name in ("V4_LIGHT_OVERHEAD_PLAN", "V4_LIGHT_PRESS_FILL"):
        light_object = bpy.data.objects.get(light_name)
        if light_object is not None and light_object.type == "LIGHT":
            light_object.data.use_shadow = False
    cameras["archive_rise"].location = (-13.2, 2.4, 1.72)
    archive_target = Vector((-20.2, 14.0, 5.30))
    cameras["archive_rise"].rotation_euler = (
        archive_target - cameras["archive_rise"].location
    ).to_track_quat("-Z", "Y").to_euler()
    cameras["archive_rise"]["kyx_review_target"] = list(archive_target)
    cameras["archive_rise"].data.lens = 40.0
    cameras["portal_lower"] = rev4.add_camera(
        "CAM_V5_PORTAL_LOWER",
        (-4.0, -15.5, -0.7),
        (-4.0, -10.0, -1.25),
        32.0,
    )
    cameras["portal_upper"] = rev4.add_camera(
        "CAM_V5_PORTAL_UPPER",
        (1.75, 0.25, 3.58),
        (1.0, -5.0, 3.18),
        28.0,
    )
    cameras["bridge_support"] = rev4.add_camera(
        "CAM_V5_BRIDGE_SUPPORT",
        (-12.0, 12.0, 2.3),
        (-18.0, 11.2, 2.7),
        42.0,
    )
    lower_glow = add_point_light(
        "V5_PORTAL_LOWER_REVIEW_GLOW",
        (-4.0, -9.4, -1.15),
        (0.08, 0.72, 0.85),
        220.0,
        2.2,
    )
    upper_glow = add_point_light(
        "V5_PORTAL_UPPER_REVIEW_GLOW",
        (1.0, -4.4, 3.28),
        (1.0, 0.38, 0.06),
        140.0,
        2.0,
    )
    lower_glow.data.use_shadow = False
    upper_glow.data.use_shadow = False
    return cameras


def render_views(
    output_root: Path,
    cameras: dict[str, bpy.types.Object],
) -> list[dict[str, Any]]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.resolution_x = 1600
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.42
    render_dir = output_root / "renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    for view_id, camera in cameras.items():
        scene.render.resolution_y = 1200 if view_id == "overhead_context" else 900
        path = render_dir / f"inkfall-rev5-geometry-portal-{view_id}.png"
        scene.camera = camera
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "path": path})
    return results


def canonicalize_glb_float_accessors(
    path: Path,
    decimal_places: int = 5,
) -> dict[str, Any]:
    """Remove sub-micrometer Blender float jitter from generated GLB data."""

    raw = bytearray(path.read_bytes())
    if raw[:4] != b"glTF" or len(raw) < 20:
        raise RuntimeError(f"Invalid GLB export: {path}")
    offset = 12
    document: dict[str, Any] | None = None
    binary_start: int | None = None
    while offset < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        chunk_start = offset + 8
        chunk_end = chunk_start + chunk_length
        if chunk_end > len(raw):
            raise RuntimeError("GLB chunk exceeds exported file bounds")
        if chunk_type == 0x4E4F534A:
            document = json.loads(
                bytes(raw[chunk_start:chunk_end])
                .decode("utf-8")
                .rstrip("\x00 \t\r\n")
            )
        elif chunk_type == 0x004E4942:
            binary_start = chunk_start
        offset = chunk_end
    if document is None or binary_start is None:
        raise RuntimeError("GLB export lacks JSON or BIN chunk")

    component_counts = {
        "SCALAR": 1,
        "VEC2": 2,
        "VEC3": 3,
        "VEC4": 4,
        "MAT2": 4,
        "MAT3": 9,
        "MAT4": 16,
    }
    changed = 0
    visited = 0
    for accessor in document.get("accessors", []):
        if (
            accessor.get("componentType") != 5126
            or "bufferView" not in accessor
        ):
            continue
        component_count = component_counts.get(accessor.get("type"))
        if component_count is None:
            raise RuntimeError(
                f"Unsupported float accessor type: {accessor.get('type')}"
            )
        view = document["bufferViews"][accessor["bufferView"]]
        if view.get("buffer", 0) != 0:
            raise RuntimeError("Generated GLB accessor uses an external buffer")
        element_size = component_count * 4
        stride = view.get("byteStride", element_size)
        base = (
            binary_start
            + view.get("byteOffset", 0)
            + accessor.get("byteOffset", 0)
        )
        for element_index in range(accessor["count"]):
            element_offset = base + element_index * stride
            for component_index in range(component_count):
                value_offset = element_offset + component_index * 4
                value = struct.unpack_from("<f", raw, value_offset)[0]
                if not math.isfinite(value):
                    raise RuntimeError("Generated GLB contains a non-finite float")
                canonical = round(value, decimal_places)
                if canonical == 0.0:
                    canonical = 0.0
                canonical_bytes = struct.pack("<f", canonical)
                if raw[value_offset : value_offset + 4] != canonical_bytes:
                    raw[value_offset : value_offset + 4] = canonical_bytes
                    changed += 1
                visited += 1
    path.write_bytes(raw)
    return {
        "kind": "canonical_float_accessor_postprocess",
        "decimalPlaces": decimal_places,
        "visitedFloatValues": visited,
        "changedFloatValues": changed,
    }


def export_modular_render_only(
    output_root: Path,
) -> tuple[Path, list[str], dict[str, Any]]:
    bpy.ops.object.select_all(action="DESELECT")
    selected: list[str] = []
    for obj in bpy.context.scene.objects:
        if (
            obj.type == "MESH"
            and obj.get("kyx_scope") == SCOPE
            and obj.get("kyx_role") == "rev5_authored_art_render_only"
            and not obj.hide_render
        ):
            obj.select_set(True)
            selected.append(obj.name)
    if not selected:
        raise RuntimeError("No Rev5 modular render-only meshes selected")
    bpy.context.view_layer.objects.active = bpy.data.objects[selected[0]]
    export_path = (
        output_root
        / "export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb"
    )
    export_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(export_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
    )
    canonicalization = canonicalize_glb_float_accessors(export_path)
    return export_path, sorted(selected), canonicalization


def scene_facts() -> dict[str, Any]:
    meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.hide_render
    ]
    parent = [
        obj for obj in meshes if obj.get("kyx_scope") != SCOPE
    ]
    rev5_meshes = [
        obj for obj in meshes if obj.get("kyx_scope") == SCOPE
    ]
    return {
        "meshCount": len(meshes),
        "parentMeshCount": len(parent),
        "rev5JoinedMeshCount": len(rev5_meshes),
        "triangleCount": sum(rev4.mesh_triangles(obj) for obj in meshes),
        "rev5TriangleCount": sum(rev4.mesh_triangles(obj) for obj in rev5_meshes),
        "materialNames": sorted(material.name for material in bpy.data.materials),
    }


def audit_new_support_bounds_against_travel_lane() -> dict[str, Any]:
    support_families = {
        "load_pier",
        "load_pier_cap",
        "landing_load_support",
        "rooted_archive_gantry",
        "rooted_archive_rack",
        "rooted_transition_frame",
        "donor_bridge_frame",
        "donor_rooted_service_riser",
        "donor_rooted_service_bank",
        "supported_context_wall",
    }
    inspected: list[dict[str, Any]] = []
    violations: list[dict[str, Any]] = []
    for obj in bpy.context.scene.objects:
        family = obj.get("kyx_family")
        if obj.type != "MESH" or family not in support_families:
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        minimum = Vector((
            min(point.x for point in corners),
            min(point.y for point in corners),
            min(point.z for point in corners),
        ))
        maximum = Vector((
            max(point.x for point in corners),
            max(point.y for point in corners),
            max(point.z for point in corners),
        ))
        center = (minimum + maximum) * 0.5
        size = maximum - minimum
        horizontal_radius = max(
            0.04,
            min(size.x, size.y) * 0.5,
        )
        object_facts = {
            "object": obj.name,
            "family": family,
            "boundsMinimumMeters": [
                round(minimum.x, 4),
                round(minimum.y, 4),
                round(minimum.z, 4),
            ],
            "boundsMaximumMeters": [
                round(maximum.x, 4),
                round(maximum.y, 4),
                round(maximum.z, 4),
            ],
        }
        inspected.append(object_facts)
        for segment_index, (start, end) in enumerate(zip(
            TRAVERSAL_CLEARANCE_POINTS,
            TRAVERSAL_CLEARANCE_POINTS[1:],
        )):
            delta = Vector((end[0] - start[0], end[1] - start[1]))
            length_squared = delta.length_squared
            if length_squared <= 1e-9:
                continue
            relative = Vector((center.x - start[0], center.y - start[1]))
            fraction = max(
                0.0,
                min(1.0, relative.dot(delta) / length_squared),
            )
            closest = Vector((
                start[0] + delta.x * fraction,
                start[1] + delta.y * fraction,
            ))
            lateral_distance = (
                Vector((center.x, center.y)) - closest
            ).length
            route_floor = start[2] + (end[2] - start[2]) * fraction
            travel_minimum_z = route_floor - 0.04
            travel_maximum_z = (
                route_floor + AUTHORITY_STANDING_CAPSULE_HEIGHT_METERS
            )
            vertical_overlap = (
                maximum.z > travel_minimum_z
                and minimum.z < travel_maximum_z
            )
            horizontal_overlap = (
                lateral_distance - horizontal_radius
                < AUTHORITY_STANDING_CAPSULE_RADIUS_METERS + 0.02
            )
            if not (vertical_overlap and horizontal_overlap):
                continue
            violations.append(
                object_facts
                | {
                    "segmentIndex": segment_index,
                    "lateralDistanceMeters": round(lateral_distance, 4),
                    "horizontalRadiusMeters": round(horizontal_radius, 4),
                    "routeFloorMeters": round(route_floor, 4),
                }
            )
    return {
        "supportFamiliesMeasured": sorted(support_families),
        "inspectedObjectCount": len(inspected),
        "inspectedObjects": inspected,
        "violationCount": len(violations),
        "violations": violations,
        "newSupportBoundsClearStandingCapsuleLane": not violations,
    }


def traversal_clearance_audit() -> dict[str, Any]:
    guard_inner_clear_width = 2.0 * (
        BRIDGE_SECTION["edgeGirderOffsetMeters"]
        - BRIDGE_SECTION["maximumRailRadiusMeters"]
    )
    capsule_diameter = 2.0 * AUTHORITY_STANDING_CAPSULE_RADIUS_METERS
    return {
        "authorityStandingCapsuleRadiusMeters": (
            AUTHORITY_STANDING_CAPSULE_RADIUS_METERS
        ),
        "authorityStandingCapsuleHeightMeters": (
            AUTHORITY_STANDING_CAPSULE_HEIGHT_METERS
        ),
        "minimumGuardInnerClearWidthMeters": round(
            guard_inner_clear_width,
            4,
        ),
        "guardClearanceMarginOverCapsuleMeters": round(
            guard_inner_clear_width - capsule_diameter,
            4,
        ),
        "parentPresentationClearWidthMeters": ROUTE_CLEAR_WIDTH_METERS,
        "parentPresentationClearHeightMeters": ROUTE_CLEAR_HEIGHT_METERS,
        "routePointCount": len(ROUTE_POINTS),
        "segmentCount": len(ROUTE_POINTS) - 1,
        "landingEntryClearancePointCount": len(TRAVERSAL_CLEARANCE_POINTS),
        "landingEntryClearanceSegmentCount": (
            len(TRAVERSAL_CLEARANCE_POINTS) - 1
        ),
        "singleSegmentRecordDrivesDeckGirdersRailsAndSupports": True,
        "checks": {
            "standingCapsuleFitsBetweenGuardRails": (
                guard_inner_clear_width >= capsule_diameter + 0.4
            ),
            "standingCapsuleFitsPresentationHeadroom": (
                ROUTE_CLEAR_HEIGHT_METERS
                >= AUTHORITY_STANDING_CAPSULE_HEIGHT_METERS + 0.4
            ),
            "parentClearanceWiderThanBridgeDeck": (
                ROUTE_CLEAR_WIDTH_METERS
                > BRIDGE_SECTION["deckWidthMeters"]
            ),
            "routeIsOneConnectedFourPointBand": (
                len(ROUTE_POINTS) == 4
                and len(ROUTE_POINTS) - 1 == 3
            ),
        },
    }


def main() -> None:
    args = rev4.parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    frozen_before = rev4.verify_frozen_inputs(repo_root)
    donor_inventory = verify_geometry_donors(repo_root)
    portal_machine_donor_inventory = verify_portal_machine_donor(repo_root)
    portal_frame_donor_inventory = verify_portal_frame_donor(repo_root)

    bpy.ops.wm.open_mainfile(
        filepath=str(repo_root / rev4.PARENT_SOURCE),
        load_ui=False,
    )
    parent_meshes = [
        obj for obj in bpy.context.scene.objects if obj.type == "MESH"
    ]
    if len(parent_meshes) != EXPECTED_PARENT_MESH_COUNT:
        raise RuntimeError(
            f"Unexpected parent mesh count: {len(parent_meshes)}"
        )
    parent_material_names = sorted(
        material.name for material in bpy.data.materials
    )
    if parent_material_names != sorted(EXPECTED_PARENT_MATERIALS):
        raise RuntimeError(
            f"Unexpected parent materials: {parent_material_names}"
        )
    materials = {
        name: bpy.data.materials[name] for name in EXPECTED_PARENT_MATERIALS
    }

    material_hierarchy = tune_material_values(materials)
    clutter_cleanup = remove_low_orphan_parent_components(parent_meshes)
    clearance = carve_continuous_clearance(parent_meshes)
    donor_instances: list[dict[str, Any]] = []
    bridge = build_connected_bridge(materials)
    landing = build_supported_landing(materials)
    donor_service_language = build_cc0_donor_service_language(
        materials,
        donor_instances,
    )
    portals = build_portal_pair(materials, donor_instances)
    traversal_audit = traversal_clearance_audit()
    support_lane_audit = audit_new_support_bounds_against_travel_lane()
    family_counts = rev4.family_counts()
    joined = join_rev5_meshes()
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
    scene["kyx_product_selectable"] = True
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_human_accepted"] = False
    scene["kyx_portal_authority_capability"] = AUTHORITY_PORTAL_CAPABILITY
    scene["kyx_cc0_donor_pack"] = (
        "Quaternius Modular Sci-Fi MegaKit Standard + Teleporter Base "
        "+ Polygonal Mind ABM Teleporter01"
    )
    scene["kyx_cc0_donor_license"] = "CC0-1.0"
    scene["kyx_cc0_donor_geometry_only"] = True
    scene["kyx_cc0_donor_instance_count"] = len(donor_instances)

    source_path = (
        output_root
        / "source/inkfall_foundry_rev5_geometry_portal.review-context.blend"
    )
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    renders = render_views(output_root, cameras)
    (
        export_path,
        selected_export_nodes,
        export_canonicalization,
    ) = export_modular_render_only(output_root)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)

    frozen_after = rev4.verify_frozen_inputs(repo_root)
    facts = scene_facts()
    source_artifact = rev4.artifact(source_path, repo_root)
    export_artifact = rev4.artifact(export_path, repo_root)
    render_artifacts = [
        rev4.artifact(item["path"], repo_root, include_resolution=True)
        | {"view": item["view"]}
        for item in renders
    ]
    camera_facts = rev4.review_camera_facts(cameras)
    constants_text = (
        repo_root / "src/content/maps/constants.ts"
    ).read_text(encoding="utf-8")
    lower, upper = PORTAL_ENDPOINTS
    exit_offsets_safe = (
        not point_inside(
            lower["exitFeetMapMm"],
            upper["triggerCenterMapMm"],
            upper["triggerHalfExtentsMapMm"],
        )
        and not point_inside(
            upper["exitFeetMapMm"],
            lower["triggerCenterMapMm"],
            lower["triggerHalfExtentsMapMm"],
        )
    )
    checks = {
        "frozenInputsUnchanged": frozen_before == frozen_after,
        "catalogDefaultStillRevision1": (
            "DEFAULT_MAP_REVISION = 1 as const" in constants_text
        ),
        "parentPressHallRetainedForReviewContext": (
            facts["parentMeshCount"] == EXPECTED_PARENT_MESH_COUNT
        ),
        "cc0DonorInventoryVerifiedAndBounded": (
            donor_inventory["modelCount"] == len(EXPECTED_DONOR_IDS)
            and donor_inventory["totalDerivedBytes"] < 1_000_000
            and donor_inventory["runtimeCollisionAuthority"] is False
        ),
        "cc0PortalMachineDonorVerifiedAndBounded": (
            portal_machine_donor_inventory["modelCount"] == 1
            and portal_machine_donor_inventory["triangleCount"] == 556
            and portal_machine_donor_inventory["runtimeCollisionAuthority"] is False
            and portal_machine_donor_inventory["sourceMaterialsReplaced"]
        ),
        "cc0PortalFrameDonorVerifiedAndBounded": (
            portal_frame_donor_inventory["modelCount"] == 1
            and portal_frame_donor_inventory["triangleCount"] == 688
            and portal_frame_donor_inventory["runtimeCollisionAuthority"] is False
            and portal_frame_donor_inventory["sourceOrbRemoved"]
            and portal_frame_donor_inventory["sourceCenterPlateRemoved"]
            and portal_frame_donor_inventory["sourceMaterialsReplaced"]
        ),
        "cc0DonorInstancesRemainRenderOnly": (
            donor_service_language["instanceCount"] == 8
            and len(donor_instances)
            == donor_service_language["instanceCount"] + 8
            and all(
                item["renderOnly"]
                and item["collisionAuthority"] is False
                for item in donor_instances
            )
        ),
        "continuousRouteAndPortalClearanceOpened": (
            len(clearance["affectedParentMeshes"]) >= 1
            and clearance["routeCutterCount"] == 4
            and clearance["portalApertureCount"] == 2
            and clearance["authorityGeometryModified"] is False
        ),
        "orphanLowFloorClutterRemovedFromReviewContext": (
            clutter_cleanup["removedComponentCount"] >= 1
            and clutter_cleanup["authorityGeometryModified"] is False
        ),
        "standingCapsuleRouteClearByConstruction": all(
            traversal_audit["checks"].values()
        ),
        "newSupportBoundsClearStandingCapsuleLane": (
            support_lane_audit["newSupportBoundsClearStandingCapsuleLane"]
            and support_lane_audit["inspectedObjectCount"] >= 1
        ),
        "bridgeHasContinuousPrimaryDecks": (
            bridge["continuousPrimaryDeck"]
            and bridge["segmentCount"] == 3
        ),
        "bridgeLoadsVisiblySupported": (
            bridge["supportComponentCount"] == 15
            and bridge["jointComponentCount"] == 12
            and bridge["railPostCount"] == 8
            and bridge["transitionFramesRootedToDeck"]
        ),
        "railsAttachedToGirders": bridge["railsRootedToDeckGirders"],
        "landingLoadsVisiblySupported": (
            landing["supportColumnCount"] == 4
            and landing["underdeckBraceCount"] == 2
            and landing["allPrimaryLoadsReachFoundationOrDeck"]
        ),
        "landingTopPreservesAuthorityAlignment": (
            abs(landing["landingFloorTopMeters"] - 6.0) <= 1e-6
        ),
        "pairedPortalLandmarkPresent": (
            len(portals) == 2
            and all(item["groundedSupportCount"] == 4 for item in portals)
            and all(item["donorGatewayFrameCount"] == 1 for item in portals)
            and all(item["donorTeleporterBaseCount"] == 1 for item in portals)
            and all(item["energyGuideRingCount"] == 2 for item in portals)
            and all(item["translucentEnergyFieldCount"] == 1 for item in portals)
            and all(item["energyFilamentCount"] == 9 for item in portals)
            and all(item["noOpaqueEnergyBillboard"] for item in portals)
        ),
        "portalExitOffsetsPreventPingPong": exit_offsets_safe,
        "portalPresentationHooksDeclared": (
            family_counts.get("portal_energy_filament_vfx_hook", 0) == 18
        ),
        "modularExportExcludesParentMeshes": (
            len(selected_export_nodes) == facts["rev5JoinedMeshCount"]
            and all(name.startswith("V5OPT_") for name in selected_export_nodes)
        ),
        "renderGeometryRemainsNonAuthority": all(
            obj.get("kyx_collision") is False
            and obj.get("kyx_authority") is False
            for obj in bpy.context.scene.objects
            if obj.type == "MESH" and obj.get("kyx_scope") == SCOPE
        ),
        "materialContinuityUsesInheritedSet": (
            facts["materialNames"] == sorted(
                list(EXPECTED_PARENT_MATERIALS)
                + [
                    "V5_PORTAL_ENERGY_RED_FOLD_LOWER",
                    "V5_PORTAL_ENERGY_RED_FOLD_UPPER",
                ]
            )
        ),
        "reviewViewsIncludeConstructionAndPortalEvidence": all(
            view in camera_facts
            for view in (
                "gameplay_continuity",
                "archive_rise",
                "bridge_support",
                "portal_lower",
                "portal_upper",
                "overhead_context",
            )
        ),
        "modularGlbWritten": export_artifact["bytes"] > 1_024,
    }
    status = (
        "INKFALL_REV5_GEOMETRY_PORTAL_BUILD_PASS_HUMAN_REVIEW_OPEN"
        if all(checks.values())
        else "INKFALL_REV5_GEOMETRY_PORTAL_BUILD_FAIL_HUMAN_REVIEW_OPEN"
    )
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_rev5_geometry_portal_build_report",
        "status": status,
        "scope": SCOPE,
        "checks": checks,
        "binding": {
            "mapId": "inkfall_foundry",
            "authorityRevision": 3,
            "authorityPackageDigest": (
                "4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a"
            ),
            "authorityFixtureHash": "97eb7772ac59dc95",
            "catalogDefaultRevision": 1,
            "artRevision": ART_REVISION,
            "productProfileRole": "non_default_inkfall_inspection_candidate",
            "renderGeometryMayBeAuthority": False,
            "portalAuthorityCapability": AUTHORITY_PORTAL_CAPABILITY,
        },
        "generator": {
            "id": GENERATOR_ID,
            "version": 1,
            "blenderVersion": bpy.app.version_string,
            "builder": rev4.artifact(Path(__file__).resolve(), repo_root),
            "projectAuthoredBaseHelper": rev4.artifact(
                REV4_BUILDER_PATH.resolve(),
                repo_root,
            ),
        },
        "cc0DonorGeometry": {
            "inventory": donor_inventory,
            "portalMachineInventory": portal_machine_donor_inventory,
            "portalFrameInventory": portal_frame_donor_inventory,
            "serviceLanguage": donor_service_language,
            "allInstances": donor_instances,
        },
        "beforeEvidence": {
            "classification": "rejected_rev4_reference_only",
            "gameplayContinuity": frozen_after["rejectedRev4GameplayEvidence"],
            "archiveRise": frozen_after["rejectedRev4RiseEvidence"],
        },
        "derivativePresentationClearance": clearance,
        "derivativeReviewContextClutterCleanup": clutter_cleanup,
        "traversalClearanceAudit": traversal_audit,
        "newSupportLaneBoundsAudit": support_lane_audit,
        "structuralCorrection": {
            "bridge": bridge,
            "landing": landing,
            "familyCountsBeforeJoin": family_counts,
            "joinedMeshes": joined,
        },
        "portalPair": {
            "authorityCapability": AUTHORITY_PORTAL_CAPABILITY,
            "endpoints": portals,
            "exitOffsetsPreventImmediatePartnerReentry": exit_offsets_safe,
            "renderMeshesMayBeAuthority": False,
            "audioVfxHooks": [
                {
                    "endpointId": endpoint["id"],
                    "departureAudio": (
                        f"inkfall.portal.{endpoint['id']}.departure"
                    ),
                    "arrivalAudio": f"inkfall.portal.{endpoint['id']}.arrival",
                    "departureVfx": (
                        f"inkfall.portal.{endpoint['id']}.energy_departure"
                    ),
                    "arrivalVfx": (
                        f"inkfall.portal.{endpoint['id']}.energy_arrival"
                    ),
                }
                for endpoint in PORTAL_ENDPOINTS
            ],
        },
        "materialValueHierarchy": material_hierarchy,
        "sceneFacts": facts,
        "frozenInputsBefore": frozen_before,
        "frozenInputsAfter": frozen_after,
        "influenceBoundary": {
            "sourceInspectedReadOnly": (
                "NotHereButAfk/Ev.io upstream/codex/daytime-rook-map at 6f570c9"
            ),
            "rootLicenseOrCopyingPresent": False,
            "adaptedAbstractPrinciples": [
                "paired portal landmark",
                "exit offset outside partner trigger",
                "vertical hoop with energized surface",
                "fast orientation readability",
            ],
            "copiedCode": False,
            "copiedGeometry": False,
            "copiedCoordinates": False,
            "copiedConstants": False,
            "copiedWording": False,
            "copiedAssets": False,
        },
        "artifacts": {
            "reviewContextBlend": source_artifact,
            "modularRenderOnlyGlb": export_artifact
            | {
                "selectedNodeCount": len(selected_export_nodes),
                "selectedNodes": selected_export_nodes,
                "containsParentPressHall": False,
                "canonicalization": export_canonicalization,
            },
            "reviewRenders": render_artifacts,
        },
        "reviewEvidenceContract": {
            "before": [
                frozen_after["rejectedRev4GameplayEvidence"]["path"],
                frozen_after["rejectedRev4RiseEvidence"]["path"],
            ],
            "afterViews": [item["view"] for item in render_artifacts],
            "humanAcceptanceRequired": True,
        },
        "nonClaims": list(NON_CLAIMS),
    }
    report_path = (
        output_root
        / "validation/inkfall-rev5-geometry-portal-build-report.json"
    )
    rev4.stable_json(report_path, report)
    report_artifact = rev4.artifact(report_path, repo_root)
    manifest = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_non_default_rev5_review_manifest",
        "id": GENERATOR_ID,
        "status": (
            "ready_for_human_visual_and_play_readability_review"
            if all(checks.values())
            else "build_failed"
        ),
        "scope": SCOPE,
        "binding": report["binding"],
        "source": {
            "builder": report["generator"]["builder"],
            "reviewContextBlend": source_artifact,
        },
        "stagedRenderExport": report["artifacts"]["modularRenderOnlyGlb"],
        "reviewRenders": render_artifacts,
        "validation": {
            "buildReport": report_artifact | {"status": status},
        },
        "nonClaims": list(NON_CLAIMS),
    }
    manifest_path = (
        output_root / "manifest.inkfall-rev5-geometry-portal.json"
    )
    rev4.stable_json(manifest_path, manifest)
    print(
        "G5_INKFALL_REV5="
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
        raise RuntimeError(f"Inkfall Rev5 build failed: {failed}")


if __name__ == "__main__":
    main()
