#!/usr/bin/env python3
"""Build four review-only runtime weapons from preserved CC0 donors.

Run with Blender:

  blender --background --factory-startup \
    --python tools/art/build-quaternius-armory-candidates.py

The donor hashes are fail-closed. Outputs remain staging-review candidates and
do not change weapon authority, damage, cadence, ammo, or ability semantics.
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
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
    / "blends"
)
DERIVATIVE_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "source"
    / "blender"
    / "kyx-weapons"
    / "quaternius-armory-rev1"
)
REVIEW_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "review"
    / "runtime-candidates"
    / "kyx-quaternius-armory-rev1"
)
REPORT_PATH = REVIEW_ROOT / "build-report.json"

SOURCE_PACK = "Quaternius Sci-Fi Gun Pack"
SOURCE_LICENSE = "CC0-1.0"

CANDIDATES = (
    {
        "candidateId": "kyx-k9-quaternius-rev1",
        "authorityWeaponId": "kyx_sidearm_v1",
        "source": "Pistol.blend",
        "sourceSha256": "c02dceeddd52545f09346ccddf94014d5ff158954c30ef432b10b0a0c1dd3445",
        "sourceObject": "Pistol",
        "rootNode": "KYX_K9_QUATERNIUS_REV1",
        "output": "kyx-k9-quaternius-rev1.glb",
        "blendOutput": "kyx-k9-quaternius-rev1.blend",
        "scale": 0.22,
        "location": (0.0, 0.0, 0.1224),
        "muzzle": (0.0, 2.3063862324, 0.55),
        "accent": (0.95, 0.48, 0.10, 1.0),
        "bevelWidth": 0.018,
    },
    {
        "candidateId": "kyx-sg4-quaternius-rev1",
        "authorityWeaponId": "kyx_scattergun_v1",
        "source": "LongPistol.blend",
        "sourceSha256": "e091af6e5658e369e27bd0852ed635591b7c936017bf214cfa26da3be3225922",
        "sourceObject": "LongPistol",
        "rootNode": "KYX_SG4_QUATERNIUS_REV1",
        "output": "kyx-sg4-quaternius-rev1.glb",
        "blendOutput": "kyx-sg4-quaternius-rev1.blend",
        "scale": 0.21,
        "location": (0.0, -0.08, -0.01297),
        "muzzle": (0.0, 3.4620645046, 0.62),
        "accent": (0.95, 0.22, 0.08, 1.0),
        "bevelWidth": 0.025,
    },
    {
        "candidateId": "kyx-longbow12-quaternius-rev1",
        "authorityWeaponId": "kyx_longshot_v1",
        "source": "Sniper rifle.blend",
        "sourceSha256": "62e97d85a907caf10aa84777ab328e18e91464d65330f865b5742987ce3fe040",
        "sourceObject": "SniperRifle",
        "rootNode": "KYX_LONGBOW12_QUATERNIUS_REV1",
        "output": "kyx-longbow12-quaternius-rev1.glb",
        "blendOutput": "kyx-longbow12-quaternius-rev1.blend",
        "scale": 0.17,
        "location": (0.0, 0.02, 0.36266),
        "muzzle": (0.0, 9.2215414047, 0.44),
        "accent": (0.20, 0.62, 0.82, 1.0),
        "bevelWidth": 0.028,
    },
    {
        "candidateId": "kyx-br6-quaternius-rev1",
        "authorityWeaponId": "kyx_breach_rocket_v1",
        "source": "Ray Gun.blend",
        "sourceSha256": "b3c9fc210844a24a7266918fcde494a43f4d1ce9f02c6f262a86b0298bb8b10b",
        "sourceObject": "RayGun",
        "rootNode": "KYX_BR6_QUATERNIUS_REV1",
        "output": "kyx-br6-quaternius-rev1.glb",
        "blendOutput": "kyx-br6-quaternius-rev1.blend",
        "scale": 0.42,
        "location": (-0.001, -0.14, 0.48308),
        "muzzle": (0.0, 2.9597184658, 0.58),
        "accent": (0.10, 0.58, 0.78, 1.0),
        "bevelWidth": 0.02,
    },
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str) -> None:
    raise RuntimeError(message)


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
        fail(f"KYX_ARMORY_MATERIAL_PRINCIPLED_MISSING name={material.name}")
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


def retune_materials(accent: tuple[float, float, float, float]) -> None:
    for material in bpy.data.materials:
        semantic = material.name.lower()
        if "detail" in semantic or "muzzle" in semantic:
            configure_material(
                material,
                base_color=accent,
                metallic=0.34,
                roughness=0.3,
                emissive=tuple(channel * 0.32 for channel in accent[:3]) + (1.0,),
                emissive_strength=0.7,
            )
            family = "ACCENT"
        elif any(token in semantic for token in ("handle", "trigger")):
            configure_material(
                material,
                base_color=(0.018, 0.024, 0.028, 1.0),
                metallic=0.08,
                roughness=0.82,
            )
            family = "GRIP"
        elif any(token in semantic for token in ("barrel", "dark", "mid", "scope")):
            configure_material(
                material,
                base_color=(0.075, 0.095, 0.11, 1.0),
                metallic=0.82,
                roughness=0.34,
            )
            family = "GUNMETAL"
        elif semantic in {"main2", "material"}:
            configure_material(
                material,
                base_color=(0.19, 0.235, 0.255, 1.0),
                metallic=0.58,
                roughness=0.43,
            )
            family = "MID_ALLOY"
        else:
            configure_material(
                material,
                base_color=(0.055, 0.085, 0.098, 1.0),
                metallic=0.68,
                roughness=0.39,
            )
            family = "DARK_ALLOY"
        material.name = f"KYX_ARMORY_{family}_{material.name.upper()}"


def apply_micro_bevel(mesh: bpy.types.Object, width: float) -> None:
    bevel = mesh.modifiers.new(name="KYX_ARMORY_MICRO_BEVEL", type="BEVEL")
    bevel.width = width
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(32.0)
    bevel.harden_normals = True
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    mesh.select_set(False)


def add_marker(root: bpy.types.Object, name: str, location: tuple[float, float, float]) -> None:
    marker = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(marker)
    marker.parent = root
    marker.location = location
    marker["presentationOnly"] = True
    marker["noHit"] = True


def inspect_glb(path: Path, required_node: str) -> dict[str, object]:
    bytes_value = path.read_bytes()
    if len(bytes_value) < 20 or bytes_value[:4] != b"glTF":
        fail(f"KYX_ARMORY_GLB_HEADER_INVALID path={path}")
    version, total_length = struct.unpack_from("<II", bytes_value, 4)
    json_length = struct.unpack_from("<I", bytes_value, 12)[0]
    json_type = bytes_value[16:20]
    if version != 2 or total_length != len(bytes_value) or json_type != b"JSON":
        fail(f"KYX_ARMORY_GLB_CONTAINER_MISMATCH path={path}")
    document = json.loads(
        bytes_value[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\0")
    )
    meshes = document.get("meshes", [])
    nodes = document.get("nodes", [])
    node_names = {
        node.get("name")
        for node in nodes
        if isinstance(node.get("name"), str)
    }
    if required_node not in node_names:
        fail(f"KYX_ARMORY_GLB_ROOT_MISSING node={required_node}")
    return {
        "meshObjectCount": len(meshes),
        "runtimePrimitiveCount": sum(
            len(mesh.get("primitives", [])) for mesh in meshes
        ),
        "triangleCount": sum(
            int(primitive.get("extras", {}).get("triangleCount", 0))
            for mesh in meshes
            for primitive in mesh.get("primitives", [])
        ),
    }


def triangulated_face_count(meshes: list[bpy.types.Object]) -> int:
    total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for source in meshes:
        evaluated = source.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            total += len(mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return total


def build_candidate(config: dict[str, object]) -> dict[str, object]:
    donor_path = DONOR_ROOT / str(config["source"])
    actual_source_hash = sha256(donor_path)
    if actual_source_hash != config["sourceSha256"]:
        fail(
            "KYX_ARMORY_DONOR_HASH_MISMATCH "
            f"source={config['source']} expected={config['sourceSha256']} "
            f"actual={actual_source_hash}"
        )
    bpy.ops.wm.open_mainfile(filepath=str(donor_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1 or meshes[0].name != config["sourceObject"]:
        fail(
            "KYX_ARMORY_DONOR_STRUCTURE_MISMATCH "
            f"source={config['source']} meshes={[mesh.name for mesh in meshes]}"
        )

    retune_materials(config["accent"])
    apply_micro_bevel(meshes[0], float(config["bevelWidth"]))
    root = bpy.data.objects.new(str(config["rootNode"]), None)
    bpy.context.scene.collection.objects.link(root)
    root.scale = (float(config["scale"]),) * 3
    root.location = config["location"]
    root["candidateId"] = config["candidateId"]
    root["authorityWeaponId"] = config["authorityWeaponId"]
    root["sourcePack"] = SOURCE_PACK
    root["sourceLicense"] = SOURCE_LICENSE
    root["sourceSha256"] = actual_source_hash
    root["presentationOnly"] = True
    root["authorityUnchanged"] = True
    root["humanAccepted"] = False
    for mesh in meshes:
        mesh.parent = root
        mesh["presentationOnly"] = True
        mesh["noHit"] = True
        mesh["authorityUnchanged"] = True

    add_marker(root, f"{config['rootNode']}_MUZZLE_REFERENCE", config["muzzle"])

    DERIVATIVE_ROOT.mkdir(parents=True, exist_ok=True)
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    blend_path = DERIVATIVE_ROOT / str(config["blendOutput"])
    output_path = REVIEW_ROOT / str(config["output"])
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    structure = inspect_glb(output_path, str(config["rootNode"]))
    structure["triangleCount"] = triangulated_face_count(meshes)
    return {
        "candidateId": config["candidateId"],
        "authorityWeaponId": config["authorityWeaponId"],
        "status": "review_only_candidate",
        "source": {
            "pack": SOURCE_PACK,
            "asset": config["source"],
            "license": SOURCE_LICENSE,
            "bytes": donor_path.stat().st_size,
            "sha256": actual_source_hash,
        },
        "outputs": {
            "blend": {
                "path": blend_path.relative_to(REPOSITORY_ROOT).as_posix(),
                "bytes": blend_path.stat().st_size,
                "sha256": sha256(blend_path),
            },
            "glb": {
                "path": output_path.relative_to(REPOSITORY_ROOT).as_posix(),
                "bytes": output_path.stat().st_size,
                "sha256": sha256(output_path),
            },
        },
        "structure": {
            **structure,
            "rootNode": config["rootNode"],
            "rootScale": [config["scale"]] * 3,
            "rootLocation": list(config["location"]),
            "microBevelWidth": config["bevelWidth"],
        },
        "claims": {
            "presentationOnly": True,
            "authorityUnchanged": True,
            "releaseEligible": False,
            "humanAccepted": False,
        },
    }


report = {
    "schemaVersion": 1,
    "status": "review_only_candidate_batch",
    "sourcePack": SOURCE_PACK,
    "sourceLicense": SOURCE_LICENSE,
    "candidates": [build_candidate(config) for config in CANDIDATES],
}
REPORT_PATH.write_text(
    json.dumps(report, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)
print("KYX_QUATERNIUS_ARMORY_BUILD=" + json.dumps(report, separators=(",", ":")))
