#!/usr/bin/env python3
"""Build the review-only VLR-7 candidate from the untouched CC0 donor.

Run with Blender:

  blender --background --python tools/art/build-vlr7-quaternius-candidate.py

The source hash is fail-closed. The generated Blend and GLB remain outside
`public/` and are not production-release assets.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DONOR_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "source"
    / "blender"
    / "vendor"
    / "quaternius-sci-fi-gun-pack"
)
DONOR_BLEND = DONOR_ROOT / "blends" / "Rifle.blend"
EXPECTED_DONOR_SHA256 = (
    "793c4abfb9135d9d11ff1efe065ad28a9ade55330547d612d98efd5bfb23d13a"
)

DERIVATIVE_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "source"
    / "blender"
    / "kyx-weapons"
    / "vlr7-quaternius-rev1"
)
REVIEW_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "review"
    / "runtime-candidates"
    / "kyx-vlr7-quaternius-rev1"
)
OUTPUT_BLEND = DERIVATIVE_ROOT / "kyx-vlr7-quaternius-rev1.blend"
OUTPUT_GLB = REVIEW_ROOT / "kyx-vlr7-quaternius-rev1.glb"
OUTPUT_REPORT = REVIEW_ROOT / "build-report.json"

ROOT_NAME = "KYX_VLR7_QUATERNIUS_REV1"
MAGAZINE_NAME = "KYX_VLR7_REVIEW_MAGAZINE"
RECEIVER_NAME = "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD"
STOCK_NAME = "KYX_VLR7_REVIEW_STOCK_GRIP"
BARREL_NAME = "KYX_VLR7_REVIEW_BARREL"
TRIGGER_GUARD_NAME = "KYX_VLR7_REVIEW_TRIGGER_GUARD"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str) -> None:
    raise RuntimeError(message)


def select_only(target: bpy.types.Object) -> None:
    for selected in list(bpy.context.selected_objects):
        selected.select_set(False)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target


def separate_loose_parts(target: bpy.types.Object) -> list[bpy.types.Object]:
    select_only(target)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return sorted(
        (
            candidate
            for candidate in bpy.context.selected_objects
            if candidate.type == "MESH"
        ),
        key=lambda candidate: candidate.name,
    )


def separate_magazine(receiver: bpy.types.Object) -> bpy.types.Object:
    """Split the donor's connected box magazine from the receiver mesh."""

    select_only(receiver)
    for polygon in receiver.data.polygons:
        center = polygon.center
        polygon.select = (
            1.05 < center.y < 2.15
            and center.z < 0.14
        )

    objects_before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    new_meshes = [
        candidate
        for candidate in set(bpy.data.objects) - objects_before
        if candidate.type == "MESH"
    ]
    if len(new_meshes) != 1:
        fail(
            "VLR7_MAGAZINE_SPLIT_MISMATCH "
            f"expected=1 actual={len(new_meshes)}"
        )
    magazine = new_meshes[0]
    if len(magazine.data.polygons) != 64:
        fail(
            "VLR7_MAGAZINE_TOPOLOGY_MISMATCH "
            f"expectedPolygons=64 actual={len(magazine.data.polygons)}"
        )
    magazine.name = MAGAZINE_NAME
    magazine.data.name = f"{MAGAZINE_NAME}_MESH"
    return magazine


def configure_material(
    material: bpy.types.Material,
    *,
    base_color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emissive: tuple[float, float, float, float] | None = None,
    emissive_strength: float = 0.0,
) -> None:
    material.diffuse_color = base_color
    material.metallic = metallic
    material.roughness = roughness
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        fail(f"VLR7_MATERIAL_PRINCIPLED_MISSING name={material.name}")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    emission_input = (
        principled.inputs.get("Emission Color")
        or principled.inputs.get("Emission")
    )
    strength_input = principled.inputs.get("Emission Strength")
    if emission_input is not None:
        emission_input.default_value = emissive or (0.0, 0.0, 0.0, 1.0)
    if strength_input is not None:
        strength_input.default_value = emissive_strength


def retune_materials() -> None:
    material_specs = {
        "Main": {
            "base_color": (0.045, 0.075, 0.09, 1.0),
            "metallic": 0.72,
            "roughness": 0.31,
        },
        "Barrel": {
            "base_color": (0.13, 0.18, 0.205, 1.0),
            "metallic": 0.92,
            "roughness": 0.2,
        },
        "ScopeHandle": {
            "base_color": (0.028, 0.047, 0.06, 1.0),
            "metallic": 0.78,
            "roughness": 0.28,
        },
        "Detail": {
            "base_color": (0.08, 0.52, 0.68, 1.0),
            "metallic": 0.34,
            "roughness": 0.23,
            "emissive": (0.02, 0.48, 0.72, 1.0),
            "emissive_strength": 2.4,
        },
        "Glass": {
            "base_color": (0.08, 0.5, 0.64, 1.0),
            "metallic": 0.06,
            "roughness": 0.12,
            "emissive": (0.02, 0.42, 0.68, 1.0),
            "emissive_strength": 1.8,
        },
    }
    for material_name, spec in material_specs.items():
        material = bpy.data.materials.get(material_name)
        if material is None:
            fail(f"VLR7_DONOR_MATERIAL_MISSING name={material_name}")
        configure_material(material, **spec)
        material.name = f"KYX_VLR7_{material_name.upper()}"


def tame_donor_rear_sight(receiver: bpy.types.Object) -> None:
    """Turn the tall donor scope boss into a low, dark reflex-sight datum."""

    dark_material = bpy.data.materials.get("ScopeHandle")
    if dark_material is None:
        fail("VLR7_REAR_SIGHT_DARK_MATERIAL_MISSING")
    dark_slot = next(
        (
            index
            for index, material in enumerate(receiver.data.materials)
            if material == dark_material
        ),
        None,
    )
    if dark_slot is None:
        receiver.data.materials.append(dark_material)
        dark_slot = len(receiver.data.materials) - 1
    affected_faces = 0
    for polygon in receiver.data.polygons:
        center = polygon.center
        if 0.55 < center.y < 0.9 and center.z > 1.15:
            polygon.material_index = dark_slot
            affected_faces += 1
    if affected_faces != 18:
        fail(
            "VLR7_REAR_SIGHT_FACE_MISMATCH "
            f"expected=18 actual={affected_faces}"
        )

    affected_vertices = [
        vertex
        for vertex in receiver.data.vertices
        if 0.55 < vertex.co.y < 0.9 and vertex.co.z > 1.15
    ]
    if len(affected_vertices) != 26:
        fail(
            "VLR7_REAR_SIGHT_VERTEX_MISMATCH "
            f"expected=26 actual={len(affected_vertices)}"
        )
    for vertex in affected_vertices:
        vertex.co.z = 1.15 + (vertex.co.z - 1.15) * 0.15
    receiver.data.update()


def add_root(parts: list[bpy.types.Object]) -> bpy.types.Object:
    root = bpy.data.objects.new(ROOT_NAME, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root["sourcePack"] = "Quaternius Sci-Fi Gun Pack"
    root["sourceLicense"] = "CC0-1.0"
    root["sourceSha256"] = EXPECTED_DONOR_SHA256
    root["reviewStatus"] = "candidate_not_human_accepted"
    root["presentationOnly"] = True
    root["authorityUnchanged"] = True

    # Blender's glTF conversion maps Blender +Y to runtime -Z and Blender +Z
    # to runtime +Y. These values place the trigger/grips and muzzle into the
    # existing VLR-7 contact contract without modifying authority semantics.
    root.scale = (0.16, 0.16, 0.16)
    root.location = (0.0, -0.16, -0.048)

    for part in parts:
        part.parent = root
        part["presentationOnly"] = True
        part["noHit"] = True
        part["authorityUnchanged"] = True
    return root


def add_review_markers(root: bpy.types.Object) -> None:
    marker_definitions = {
        "KYX_VLR7_REVIEW_MUZZLE_REFERENCE": (0.0, 5.5625, 0.95625),
        "KYX_VLR7_REVIEW_DOMINANT_GRIP_REFERENCE": (0.0, -0.1875, -0.41875),
        "KYX_VLR7_REVIEW_SUPPORT_GRIP_REFERENCE": (-0.125, 3.25, 0.05),
    }
    for name, location in marker_definitions.items():
        marker = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(marker)
        marker.parent = root
        marker.location = location
        marker["presentationOnly"] = True
        marker["noHit"] = True


def triangulated_face_count(objects: list[bpy.types.Object]) -> int:
    total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for source in objects:
        evaluated = source.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            total += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return total


def build() -> dict[str, object]:
    if not DONOR_BLEND.is_file():
        fail(f"VLR7_DONOR_MISSING path={DONOR_BLEND}")
    donor_sha256 = sha256(DONOR_BLEND)
    if donor_sha256 != EXPECTED_DONOR_SHA256:
        fail(
            "VLR7_DONOR_HASH_MISMATCH "
            f"expected={EXPECTED_DONOR_SHA256} actual={donor_sha256}"
        )

    DERIVATIVE_ROOT.mkdir(parents=True, exist_ok=True)
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(DONOR_BLEND))

    original = bpy.data.objects.get("Rifle")
    if original is None or original.type != "MESH":
        fail("VLR7_DONOR_ROOT_MISSING expected=Rifle")
    parts = separate_loose_parts(original)
    part_by_name = {part.name: part for part in parts}
    expected_names = {"Rifle", *(f"Rifle.{index:03d}" for index in range(1, 25))}
    if set(part_by_name) != expected_names:
        fail(
            "VLR7_DONOR_LOOSE_PART_MISMATCH "
            f"expected={len(expected_names)} actual={len(part_by_name)}"
        )

    receiver = part_by_name["Rifle.002"]
    magazine = separate_magazine(receiver)
    tame_donor_rear_sight(receiver)

    # The donor's long-range scope is intentionally excluded. The live VLR-7
    # keeps its runtime reflex optic/reticle so ADS and sight-line behavior
    # remain stable while the authored receiver silhouette is reviewed.
    donor_scope = part_by_name["Rifle.023"]
    donor_rear_scope_block = part_by_name["Rifle.001"]
    bpy.data.objects.remove(donor_scope, do_unlink=True)
    bpy.data.objects.remove(donor_rear_scope_block, do_unlink=True)

    part_by_name["Rifle"].name = STOCK_NAME
    part_by_name["Rifle"].data.name = f"{STOCK_NAME}_MESH"
    receiver.name = RECEIVER_NAME
    receiver.data.name = f"{RECEIVER_NAME}_MESH"
    part_by_name["Rifle.003"].name = BARREL_NAME
    part_by_name["Rifle.003"].data.name = f"{BARREL_NAME}_MESH"
    part_by_name["Rifle.024"].name = TRIGGER_GUARD_NAME
    part_by_name["Rifle.024"].data.name = f"{TRIGGER_GUARD_NAME}_MESH"

    rails = [
        part_by_name[f"Rifle.{index:03d}"]
        for index in range(4, 23)
    ]
    for index, rail in enumerate(rails, start=1):
        rail.name = f"KYX_VLR7_REVIEW_RAIL_TOOTH_{index:02d}"
        rail.data.name = f"{rail.name}_MESH"

    retune_materials()
    final_parts = sorted(
        (
            part
            for part in bpy.context.scene.objects
            if part.type == "MESH"
        ),
        key=lambda part: part.name,
    )
    if len(final_parts) != 24:
        fail(
            "VLR7_DERIVATIVE_PART_COUNT_MISMATCH "
            f"expected=24 actual={len(final_parts)}"
        )
    root = add_root(final_parts)
    add_review_markers(root)

    # Save the editable derivative before exporting the runtime review GLB.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)

    for selected in list(bpy.context.selected_objects):
        selected.select_set(False)
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )

    glb_sha256 = sha256(OUTPUT_GLB)
    report = {
        "schemaVersion": 1,
        "status": "review_only_candidate",
        "candidateId": "kyx-vlr7-quaternius-rev1",
        "source": {
            "pack": "Quaternius Sci-Fi Gun Pack",
            "asset": "Rifle.blend",
            "license": "CC0-1.0",
            "bytes": DONOR_BLEND.stat().st_size,
            "sha256": donor_sha256,
        },
        "outputs": {
            "blend": {
                "path": OUTPUT_BLEND.relative_to(REPOSITORY_ROOT).as_posix(),
                "bytes": OUTPUT_BLEND.stat().st_size,
                "sha256": sha256(OUTPUT_BLEND),
            },
            "glb": {
                "path": OUTPUT_GLB.relative_to(REPOSITORY_ROOT).as_posix(),
                "bytes": OUTPUT_GLB.stat().st_size,
                "sha256": glb_sha256,
            },
        },
        "structure": {
            "meshCount": len(final_parts),
            "triangleCount": triangulated_face_count(final_parts),
            "magazineNode": MAGAZINE_NAME,
            "scopePolicy": "donor_scope_removed_runtime_reflex_retained",
            "rootScale": list(root.scale),
            "rootLocation": list(root.location),
        },
        "claims": {
            "presentationOnly": True,
            "authorityUnchanged": True,
            "releaseEligible": False,
            "humanAccepted": False,
        },
    }
    OUTPUT_REPORT.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return report


REPORT = build()
print("KYX_VLR7_REVIEW_BUILD " + json.dumps(REPORT, separators=(",", ":")))
