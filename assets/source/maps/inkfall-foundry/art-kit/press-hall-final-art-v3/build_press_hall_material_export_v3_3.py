"""Build the asset-only Press Hall v3.3 explicit-material export candidate.

This script must be launched with the frozen v3.2 readability source already
open in Blender. It creates a derived source with simple, exporter-supported
Principled BSDF materials, renders review views, spatial/material joins the
static presentation meshes, and exports a non-integrated GLB. The v3.2 source,
exports, evidence, locked P6.7 map, collision, and product routes are read-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import struct
from array import array
from pathlib import Path
from typing import Any

import bpy


SCOPE = "G5_BOUNDED_PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_ONLY"
GENERATOR_ID = "inkfall_foundry_press_hall_material_export_v3_3"
EXPECTED_V32_SOURCE = (
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/"
    "readability-v3-2/source/inkfall_foundry_press_hall_readability_v3_2.blend"
)
EXPECTED_MATERIALS = {
    "V3_AQUA_INDICATOR",
    "V3_CAST_IRON",
    "V3_CHIPPED_SAFETY_RED",
    "V3_GARDEN_FRAGMENT",
    "V3_GREASED_LINKAGE",
    "V3_INK_BLACK",
    "V3_USED_CERAMIC",
    "V3_WORN_AMBER",
    "V3_WORN_STEEL",
}

# Values are scene-linear representative midpoints of the v3.2 procedural
# color ramps. They preserve the reviewed family hierarchy without pretending
# that unsupported object-coordinate procedural nodes survived glTF export.
MATERIALS: dict[str, dict[str, Any]] = {
    "V3_CAST_IRON": {
        "base": (0.0515, 0.0740, 0.0805, 1.0), "metallic": 0.92, "roughness": 0.455,
    },
    "V3_WORN_STEEL": {
        "base": (0.1700, 0.1940, 0.1910, 1.0), "metallic": 0.96, "roughness": 0.350,
    },
    "V3_GREASED_LINKAGE": {
        "base": (0.0180, 0.0140, 0.0100, 1.0), "metallic": 0.28, "roughness": 0.320,
    },
    "V3_INK_BLACK": {
        "base": (0.0130, 0.0190, 0.0235, 1.0), "metallic": 0.08, "roughness": 0.555,
    },
    "V3_USED_CERAMIC": {
        "base": (0.4400, 0.4050, 0.3350, 1.0), "metallic": 0.02, "roughness": 0.730,
    },
    "V3_CHIPPED_SAFETY_RED": {
        "base": (0.4400, 0.0360, 0.0120, 1.0), "metallic": 0.24, "roughness": 0.535,
    },
    "V3_WORN_AMBER": {
        "base": (0.5950, 0.2850, 0.0165, 1.0), "metallic": 0.18, "roughness": 0.510,
    },
    "V3_AQUA_INDICATOR": {
        "base": (0.0195, 0.4200, 0.3900, 1.0), "metallic": 0.0, "roughness": 0.335,
        "emission": (0.0350, 0.7200, 0.6600, 1.0), "emission_strength": 2.4,
    },
    "V3_GARDEN_FRAGMENT": {
        "base": (0.0850, 0.1575, 0.0450, 1.0), "metallic": 0.0, "roughness": 0.820,
    },
}

CAMERAS = {
    "gameplay_lane": "CAM_V32_GAMEPLAY_LANE",
    "gameplay_north": "CAM_V32_GAMEPLAY_NORTH",
    "gameplay_south": "CAM_V32_GAMEPLAY_SOUTH",
    "north_force": "CAM_V32_NORTH_FORCE",
    "south_tension": "CAM_V32_SOUTH_TENSION",
    "overhead_context": "CAM_V32_CONTEXT",
}

PROTECTED_V32 = [
    EXPECTED_V32_SOURCE,
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/export/inkfall_foundry_press_hall_readability_v3_2.glb",
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/export/inkfall_foundry_press_hall_readability_v3_2.spatial-material-joined.glb",
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/manifest.press-hall-readability-v3-2.json",
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/validation/press-hall-readability-v3-2-build-report.json",
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/boards/inkfall-press-hall-v3-2-gameplay-readability-board.png",
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/boards/inkfall-press-hall-v3-2-neutral-diagnostic-board.png",
    "assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json",
    "assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json",
    "assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb",
    "src/content/maps/constants.ts",
]


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument(
        "--output-relative",
        default=(
            "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/"
            "material-export-v3-3"
        ),
    )
    values = bpy.app.driver_namespace.get("kyx_v33_args")
    if values is not None:
        return values
    import sys
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parsed = parser.parse_args(argv)
    bpy.app.driver_namespace["kyx_v33_args"] = parsed
    return parsed


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def relative(path: Path, repo_root: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def artifact(path: Path, repo_root: Path, **extra: Any) -> dict[str, Any]:
    return {
        "path": relative(path, repo_root),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        **extra,
    }


def protected_hashes(repo_root: Path) -> dict[str, dict[str, Any]]:
    result = {}
    for item in PROTECTED_V32:
        path = repo_root / item
        if not path.is_file():
            raise RuntimeError(f"Protected v3.2/P6.7 artifact missing: {item}")
        result[item] = {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
    return result


def assert_source(repo_root: Path) -> None:
    expected = (repo_root / EXPECTED_V32_SOURCE).resolve()
    actual = Path(bpy.data.filepath).resolve()
    if actual != expected:
        raise RuntimeError(f"V33_SOURCE_MISMATCH expected={expected} actual={actual}")
    actual_materials = {material.name for material in bpy.data.materials if material.name.startswith("V3_")}
    if actual_materials != EXPECTED_MATERIALS:
        raise RuntimeError(
            f"V33_MATERIAL_SET_MISMATCH expected={sorted(EXPECTED_MATERIALS)} "
            f"actual={sorted(actual_materials)}"
        )


def configure_explicit_materials() -> list[dict[str, Any]]:
    results = []
    for name in sorted(EXPECTED_MATERIALS):
        material = bpy.data.materials.get(name)
        if material is None:
            raise RuntimeError(f"V33_MATERIAL_MISSING {name}")
        values = MATERIALS[name]
        material.use_nodes = True
        material.diffuse_color = values["base"]
        material.use_backface_culling = False
        material["kyx_scope"] = SCOPE
        material["kyx_export_encoding"] = "explicit_principled_factors_v3_3"
        material["kyx_v3_2_procedural_source_preserved"] = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (280, 0)
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        principled.location = (0, 0)
        principled.inputs["Base Color"].default_value = values["base"]
        principled.inputs["Metallic"].default_value = values["metallic"]
        principled.inputs["Roughness"].default_value = values["roughness"]
        if "emission" in values:
            principled.inputs["Emission Color"].default_value = values["emission"]
            principled.inputs["Emission Strength"].default_value = values["emission_strength"]
        links.new(principled.outputs["BSDF"], output.inputs["Surface"])
        results.append({
            "name": name,
            "baseColorLinear": list(values["base"]),
            "metallic": values["metallic"],
            "roughness": values["roughness"],
            "emissionLinear": list(values.get("emission", (0.0, 0.0, 0.0, 1.0))),
            "emissionStrength": values.get("emission_strength", 0.0),
            "exporterSupportedNodes": [node.bl_idname for node in nodes],
        })
    return results


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False


def render_views(output_root: Path, mode: str, view_ids: list[str]) -> list[Path]:
    scene = bpy.context.scene
    render_root = output_root / "renders"
    render_root.mkdir(parents=True, exist_ok=True)
    paths = []
    for view_id in view_ids:
        camera = bpy.data.objects.get(CAMERAS[view_id])
        if camera is None or camera.type != "CAMERA":
            raise RuntimeError(f"V33_CAMERA_MISSING {view_id}")
        output_path = render_root / f"inkfall-press-hall-v3-3-{view_id}-{mode}.png"
        scene.camera = camera
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        paths.append(output_path)
    return paths


def neutral_state(enable: bool, saved: dict[str, Any] | None = None) -> dict[str, Any] | None:
    scene = bpy.context.scene
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("V33_WORLD_BACKGROUND_MISSING")
    if enable:
        state = {
            "exposure": scene.view_settings.exposure,
            "look": scene.view_settings.look,
            "worldColor": tuple(background.inputs["Color"].default_value),
            "worldStrength": float(background.inputs["Strength"].default_value),
            "lights": [
                (obj, float(obj.data.energy), tuple(obj.data.color))
                for obj in bpy.data.objects if obj.type == "LIGHT"
            ],
        }
        scene.view_settings.exposure = 1.10
        scene.view_settings.look = "AgX - Medium Low Contrast"
        background.inputs["Color"].default_value = (0.040, 0.040, 0.040, 1.0)
        background.inputs["Strength"].default_value = 0.55
        for obj, energy, _ in state["lights"]:
            obj.data.energy = energy * 1.15
            obj.data.color = (1.0, 1.0, 1.0)
        return state
    if saved is None:
        raise RuntimeError("V33_NEUTRAL_RESTORE_STATE_MISSING")
    scene.view_settings.exposure = saved["exposure"]
    scene.view_settings.look = saved["look"]
    background.inputs["Color"].default_value = saved["worldColor"]
    background.inputs["Strength"].default_value = saved["worldStrength"]
    for obj, energy, color in saved["lights"]:
        obj.data.energy = energy
        obj.data.color = color
    return None


def create_board(output_path: Path, image_paths: list[Path], board_id: str) -> None:
    if len(image_paths) != 4:
        raise RuntimeError("V33_BOARD_REQUIRES_FOUR_IMAGES")
    width, height = 1920, 1080
    panel_width, panel_height = 960, 540
    canvas = array("f", [0.003, 0.004, 0.006, 1.0]) * (width * height)
    placements = [(0, 540), (960, 540), (0, 0), (960, 0)]
    for image_path, (origin_x, origin_y) in zip(image_paths, placements):
        source = bpy.data.images.load(str(image_path), check_existing=False)
        source.scale(panel_width, panel_height)
        pixels = array("f", [0.0]) * (panel_width * panel_height * 4)
        source.pixels.foreach_get(pixels)
        row_size = panel_width * 4
        for row in range(panel_height):
            source_start = row * row_size
            target_start = ((origin_y + row) * width + origin_x) * 4
            canvas[target_start : target_start + row_size] = pixels[source_start : source_start + row_size]
        bpy.data.images.remove(source)
    board = bpy.data.images.new(f"G5_V33_BOARD_{board_id}", width=width, height=height, alpha=True)
    board.pixels.foreach_set(canvas)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.filepath_raw = str(output_path)
    board.file_format = "PNG"
    board.save()
    bpy.data.images.remove(board)


def image_summary(path: Path) -> dict[str, Any]:
    image = bpy.data.images.load(str(path), check_existing=False)
    image.scale(320, 180)
    pixels = array("f", [0.0]) * (320 * 180 * 4)
    image.pixels.foreach_get(pixels)
    luminance = []
    channel_sums = [0.0, 0.0, 0.0]
    for index in range(0, len(pixels), 4):
        rgb = pixels[index : index + 3]
        luminance.append(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2])
        for channel in range(3):
            channel_sums[channel] += rgb[channel]
    bpy.data.images.remove(image)
    count = len(luminance)
    return {
        "meanRgbLinear": [round(value / count, 6) for value in channel_sums],
        "meanLuminance": round(statistics.fmean(luminance), 6),
        "medianLuminance": round(statistics.median(luminance), 6),
        "shadowFractionBelow0035": round(sum(value < 0.035 for value in luminance) / count, 6),
    }


def image_pair_summary(left_path: Path, right_path: Path) -> dict[str, Any]:
    images = []
    for path in (left_path, right_path):
        image = bpy.data.images.load(str(path), check_existing=False)
        image.scale(320, 180)
        pixels = array("f", [0.0]) * (320 * 180 * 4)
        image.pixels.foreach_get(pixels)
        images.append((image, pixels))
    left, right = images[0][1], images[1][1]
    absolute = []
    for index in range(0, len(left), 4):
        absolute.extend(abs(left[index + channel] - right[index + channel]) for channel in range(3))
    for image, _ in images:
        bpy.data.images.remove(image)
    return {
        "meanAbsoluteRgbLinear": round(statistics.fmean(absolute), 6),
        "p95AbsoluteRgbLinear": round(sorted(absolute)[math.ceil(len(absolute) * 0.95) - 1], 6),
    }


def spatial_module(obj: bpy.types.Object) -> str:
    center = obj.matrix_world.translation
    if center.y > 3.0:
        return "north"
    if center.y < -3.0:
        return "south"
    return "center_east" if center.x >= 0.0 else "center_west"


def join_static_by_spatial_material() -> dict[str, Any]:
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.hide_render
        and obj.get("kyx_collision") in {False, None}
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in candidates:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = candidates[0]
    bpy.ops.object.convert(target="MESH")
    candidates = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    groups: dict[tuple[str, str], list[bpy.types.Object]] = {}
    for obj in candidates:
        material = next((slot.material.name for slot in obj.material_slots if slot.material), "NO_MATERIAL")
        groups.setdefault((spatial_module(obj), material), []).append(obj)
    joined = []
    for (module, material), objects in sorted(groups.items()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        merged = bpy.context.active_object
        source_material = bpy.data.materials.get(material)
        merged.data.materials.clear()
        if source_material is not None:
            merged.data.materials.append(source_material)
        for polygon in merged.data.polygons:
            polygon.material_index = 0
        safe_material = "".join(character if character.isalnum() else "_" for character in material)[:48]
        merged.name = f"V33OPT_{module.upper()}_{safe_material}"
        merged["kyx_scope"] = SCOPE
        merged["kyx_role"] = "v3_3_spatial_material_joined_export"
        merged["kyx_spatial_module"] = module
        joined.append({
            "object": merged.name,
            "module": module,
            "material": material,
            "sourceObjectCount": len(objects),
        })
    bpy.ops.object.select_all(action="DESELECT")
    return {
        "groupCount": len(joined),
        "groups": joined,
        "sourceMeshObjectCount": len(candidates),
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render or obj.get("kyx_collision") not in {False, None}:
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("V33_EXPORT_SELECTION_EMPTY")
    bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")


def glb_document(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        magic, version, declared = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2 or declared != path.stat().st_size:
            raise RuntimeError("V33_GLB_HEADER_INVALID")
        json_length, chunk_type = struct.unpack("<II", handle.read(8))
        if chunk_type != 0x4E4F534A:
            raise RuntimeError("V33_GLB_JSON_CHUNK_MISSING")
        return json.loads(handle.read(json_length).decode("utf-8").rstrip(" \t\r\n\x00"))


def glb_audit(path: Path) -> dict[str, Any]:
    document = glb_document(path)
    accessors = document.get("accessors", [])
    primitive_count = 0
    triangles = 0
    position_vertices = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is not None:
                position_vertices += int(accessors[position_index].get("count", 0))
            index = primitive.get("indices")
            triangles += int(accessors[index].get("count", 0)) // 3 if index is not None else 0
    materials = []
    for material in document.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        materials.append({
            "name": material.get("name"),
            "baseColorFactor": pbr.get("baseColorFactor"),
            "baseColorTexture": pbr.get("baseColorTexture"),
            "metallicFactor": pbr.get("metallicFactor"),
            "roughnessFactor": pbr.get("roughnessFactor"),
            "emissiveFactor": material.get("emissiveFactor"),
            "emissiveStrength": material.get("extensions", {}).get(
                "KHR_materials_emissive_strength", {}
            ).get("emissiveStrength"),
        })
    return {
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "asset": document.get("asset"),
        "nodeCount": len(document.get("nodes", [])),
        "meshCount": len(document.get("meshes", [])),
        "primitiveCount": primitive_count,
        "summedPositionVertices": position_vertices,
        "triangleCount": triangles,
        "materialCount": len(materials),
        "explicitBaseColorFactorCount": sum(
            isinstance(material["baseColorFactor"], list) and len(material["baseColorFactor"]) == 4
            for material in materials
        ),
        "baseColorTextureReferenceCount": sum(
            material["baseColorTexture"] is not None for material in materials
        ),
        "textureCount": len(document.get("textures", [])),
        "imageCount": len(document.get("images", [])),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
        "materials": materials,
    }


def main() -> None:
    args = arguments()
    repo_root = Path(args.repo_root).resolve()
    output_root = (repo_root / args.output_relative).resolve()
    if output_root != repo_root and not output_root.is_relative_to(repo_root):
        raise RuntimeError("V33_OUTPUT_OUTSIDE_REPOSITORY")
    manifest_path = output_root / "manifest.press-hall-material-export-v3-3.json"
    if manifest_path.exists():
        raise RuntimeError(f"V33_OUTPUT_ALREADY_EXISTS {manifest_path}")
    assert_source(repo_root)
    protected_before = protected_hashes(repo_root)
    material_authoring = configure_explicit_materials()
    configure_render()

    source_path = output_root / "source/inkfall_foundry_press_hall_material_export_v3_3.blend"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)

    color_ids = ["gameplay_lane", "gameplay_north", "gameplay_south", "overhead_context"]
    neutral_ids = ["gameplay_north", "gameplay_south", "north_force", "south_tension"]
    color_paths = render_views(output_root, "color", color_ids)
    saved_neutral = neutral_state(True)
    neutral_paths = render_views(output_root, "neutral", neutral_ids)
    neutral_state(False, saved_neutral)

    gameplay_board = output_root / "boards/inkfall-press-hall-v3-3-blender-gameplay-board.png"
    neutral_board = output_root / "boards/inkfall-press-hall-v3-3-neutral-board.png"
    create_board(gameplay_board, color_paths, "GAMEPLAY")
    create_board(neutral_board, neutral_paths, "NEUTRAL")

    image_diagnostics = {}
    for view_id, path in zip(color_ids, color_paths):
        frozen = repo_root / (
            "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/"
            f"readability-v3-2/renders/inkfall-press-hall-v3-2-{view_id}-color.png"
        )
        image_diagnostics[view_id] = {
            "v33": image_summary(path),
            "frozenV32": image_summary(frozen),
            "pair": image_pair_summary(path, frozen),
        }

    join_report = join_static_by_spatial_material()
    optimized_source = output_root / "source/inkfall_foundry_press_hall_material_export_v3_3.optimized-export.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(optimized_source), check_existing=False)
    glb_path = output_root / "export/inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb"
    export_glb(glb_path)
    audit = glb_audit(glb_path)
    protected_after = protected_hashes(repo_root)

    checks = {
        "sourceWasFrozenV32": Path(bpy.data.filepath).resolve() == optimized_source.resolve(),
        "protectedV32AndP67Unchanged": protected_before == protected_after,
        "sourceMeshCountPreserved": join_report["sourceMeshObjectCount"] == 654,
        "spatialMaterialGroups": join_report["groupCount"] == 29,
        "glbNodes": audit["nodeCount"] == 29,
        "glbMeshes": audit["meshCount"] == 29,
        "glbPrimitives": audit["primitiveCount"] == 29,
        "glbTriangles": audit["triangleCount"] == 188_576,
        "glbMaterials": audit["materialCount"] == 9,
        "allMaterialsExplicitBaseColor": audit["explicitBaseColorFactorCount"] == 9,
        "noUnexpectedTextures": audit["textureCount"] == 0 and audit["imageCount"] == 0,
        "payloadBounded": audit["bytes"] <= 13_500_000,
        "reviewImages": all(path.is_file() and path.stat().st_size > 50_000 for path in [*color_paths, *neutral_paths]),
        "reviewBoards": all(path.is_file() and path.stat().st_size > 100_000 for path in [gameplay_board, neutral_board]),
    }
    status = (
        "BOUNDED_PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_BUILD_PASS_PENDING_ACTUAL_LOADER_REVIEW"
        if all(checks.values())
        else "BOUNDED_PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_BUILD_FAILED"
    )
    render_artifacts = [
        artifact(path, repo_root, view=view_id, mode="color")
        for view_id, path in zip(color_ids, color_paths)
    ] + [
        artifact(path, repo_root, view=view_id, mode="neutral")
        for view_id, path in zip(neutral_ids, neutral_paths)
    ]
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_v3_3_explicit_material_export_build_report",
        "status": status,
        "scope": SCOPE,
        "source": {
            "frozenV32": protected_before[EXPECTED_V32_SOURCE],
            "derivedBlend": artifact(source_path, repo_root),
            "optimizedBlend": artifact(optimized_source, repo_root),
            "builder": artifact(Path(__file__).resolve(), repo_root),
        },
        "binding": {
            "mapId": "inkfall_foundry",
            "mapRevision": 2,
            "catalogDefaultRevision": 1,
            "productIntegrated": False,
            "shippingDefault": False,
            "artGeometryMayBeAuthority": False,
        },
        "materialAuthoring": material_authoring,
        "glbAudit": audit,
        "join": join_report,
        "imageDiagnosticsVsFrozenV32": image_diagnostics,
        "renders": render_artifacts,
        "boards": [
            artifact(gameplay_board, repo_root, id="blender_gameplay", resolution=[1920, 1080]),
            artifact(neutral_board, repo_root, id="neutral", resolution=[1920, 1080]),
        ],
        "protectedV32AndP67Before": protected_before,
        "protectedV32AndP67After": protected_after,
        "checks": checks,
        "knownBlockers": [
            "actual Three.js GLTFLoader render and direct comparison board are still required",
            "explicit factors preserve material-family color but intentionally omit unsupported procedural pitting",
            "runtime performance and playable no-snag proof are outside this asset-only build",
            "human visual and gameplay acceptance remain open",
        ],
        "nonClaims": [
            "G5_NOT_PASSED",
            "G8_NOT_PASSED",
            "FINAL_ART_NOT_ACCEPTED",
            "ACTUAL_LOADER_REVIEW_PENDING",
            "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
            "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
            "NOT_PRODUCT_INTEGRATED",
            "NOT_SHIPPING_DEFAULT",
            "NO_DEPLOYMENT_OR_PUBLISHING",
        ],
    }
    report_path = output_root / "validation/press-hall-material-export-v3-3-build-report.json"
    stable_json(report_path, report)
    manifest = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_staged_press_hall_material_export_manifest",
        "id": GENERATOR_ID,
        "status": "asset_candidate_pending_actual_loader_review" if all(checks.values()) else "build_failed",
        "scope": SCOPE,
        "binding": report["binding"],
        "source": report["source"],
        "export": artifact(glb_path, repo_root) | {
            "nodeCount": audit["nodeCount"],
            "primitiveCount": audit["primitiveCount"],
            "triangleCount": audit["triangleCount"],
            "materialCount": audit["materialCount"],
            "explicitBaseColorFactorCount": audit["explicitBaseColorFactorCount"],
        },
        "boards": report["boards"],
        "validation": {
            "buildReport": artifact(report_path, repo_root) | {"status": status},
            "actualLoaderEvidence": "PENDING",
            "independentVerification": "PENDING",
        },
        "nonClaims": report["nonClaims"],
    }
    stable_json(manifest_path, manifest)
    print("PRESS_HALL_V3_3_MATERIAL_EXPORT=" + json.dumps({
        "status": status,
        "output": str(output_root),
        "glb": audit,
        "checks": checks,
        "manifest": str(manifest_path),
        "report": str(report_path),
    }, sort_keys=True))
    if not all(checks.values()):
        raise RuntimeError(
            f"V33_BUILD_FAILED {[key for key, value in checks.items() if not value]}"
        )


if __name__ == "__main__":
    main()
