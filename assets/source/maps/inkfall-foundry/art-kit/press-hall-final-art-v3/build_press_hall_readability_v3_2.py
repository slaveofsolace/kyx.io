"""Build the non-integrated Press Hall v3.2 readability and payload review.

The existing v3 final package is a frozen conditional candidate.  This pass
opens its exact Blender source and changes only review lighting, cameras, and
evidence outputs.  Geometry, collision authority, runtime selection, and the
catalog default are not changed.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
import sys
from array import array
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


SCOPE = "G5_BOUNDED_PRESS_HALL_V3_2_READABILITY_PREVIEW_ONLY"
GENERATOR_ID = "inkfall_foundry_press_hall_readability_v3_2"
VISUAL_DECISION = "PENDING_PARENT_FINAL_REVIEW"

FROZEN_FINAL = {
    "builder": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/build_press_hall_final_art_v3.py",
        "63023443ed9047a63f5f20a042ac13640e7b625a2f2a2da749a36599c97ca77a",
    ),
    "verifier": (
        "tools/evidence/verify-inkfall-g5-press-hall-final-art-v3.py",
        "45d1373c24665d8805bb8a8fb1d8ca15819514613bf6cc35ff872a258066af86",
    ),
    "source": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/source/inkfall_foundry_press_hall_final_art_v3.blend",
        "160ce9e8be88f88149f55732200652d48d608dd26ad404804f794585c5aaf09b",
    ),
    "report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/validation/press-hall-final-art-v3-build-report.json",
        "573adae86fa96e02a92a2b49e1575e2dfa17aa1e73ba509015446a31be8d9c9d",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/manifest.press-hall-final-art-v3.json",
        "9bae11f5ae75d1fce1794b41f7ca9653827ee6649e4b42c543b17b1976880909",
    ),
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/export/inkfall_foundry_press_hall_final_art_v3.glb",
        "0699bf53860261d4204c3e9b1b5e61cec51324bf195ab5a3dc4852cfcf573e20",
    ),
    "primary_board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/boards/inkfall-press-hall-v3-primary-review-board.png",
        "51b0809d597be11f4f3bf88cadd3d1ced902cbc2aa3badb56a8fbadfb13046fa",
    ),
    "mechanical_board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/boards/inkfall-press-hall-v3-mechanical-review-board.png",
        "1276ad31c19e73101c08d7c7a4ceff7a1d5e47f03d9cb750a4e5471d911cc02b",
    ),
    "baffle": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-baffle_detail.png",
        "0798c50c7d86c29870c22c72d1b8855c28c8eb4a817c3b16425de4778176c233",
    ),
    "cover": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-cover_detail.png",
        "985598aeb16bdd503afc8099bc3265bacc82cc0d228c97128b4eea678be74996",
    ),
    "gameplay": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-gameplay_lane.png",
        "ec2ba46826f63fa6605a24a27de6299f7ac3cdffe4ad3f194561decc8776b516",
    ),
    "north_force": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-north_force_path.png",
        "adea73468532de046f5575dab2de2dbc5e866b34cd809b566b10e45f4cbe4ae9",
    ),
    "north_hero": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-north_hero.png",
        "7a05c05dd15df962e8451ff45f8e2052f5b8ef473224a69d3d888bc0d625bbec",
    ),
    "context": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-overhead_context.png",
        "f2fb551b69dd476ea9d723b17499325d5f4358ea6121b4e695f1088e4b2134c6",
    ),
    "south_hero": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-south_hero.png",
        "609160139596dac970d3f2dfe1ccbe1aa2f06e1bed256ab1dc0809bf33193913",
    ),
    "south_tension": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/renders/inkfall-press-hall-v3-south_tension.png",
        "a3c752302bc41f756540bbf923729d0b599b1cc3dea936bb9076e41e3774c4bd",
    ),
}

NON_CLAIMS = [
    "G5_NOT_PASSED",
    "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
    "PERFORMANCE_NOT_MEASURED",
    "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE",
    "COLOR_VISION_REVIEW_NOT_COMPLETE",
    "PRODUCT_INTEGRATION_NOT_COMPLETE",
    "REVISION_2_NOT_DEFAULT_OR_SHIPPING",
    "PAYLOAD_MEASURED_NOT_RUNTIME_PROFILED",
    "DEPLOYMENT_NOT_AUTHORIZED",
]


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def verify_hash_set(repo_root: Path) -> dict[str, dict[str, str]]:
    results = {}
    for key, (relative, expected_sha) in FROZEN_FINAL.items():
        actual_sha = sha256_file(repo_root / relative)
        if actual_sha != expected_sha:
            raise RuntimeError(f"Frozen v3 final drift: {key}: expected {expected_sha}, got {actual_sha}")
        results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
    return results


def import_v31(repo_root: Path):
    path = repo_root / "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/build_press_hall_hero_checkpoint_v3.py"
    spec = importlib.util.spec_from_file_location("inkfall_press_hall_v31_for_readability", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import camera/light helpers: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.SCOPE = SCOPE
    return module


def remove_collection_objects(collection_name: str) -> list[str]:
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        return []
    names = sorted(obj.name for obj in collection.objects)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    return names


def create_camera(v31, collection, name, location, target, lens):
    camera = v31.create_camera(name, location, target, lens, collection)
    camera["kyx_scope"] = SCOPE
    camera["kyx_role"] = "v3_2_readability_camera"
    return camera


def configure_cameras(v31, collection) -> dict[str, bpy.types.Object]:
    return {
        "gameplay_lane": create_camera(v31, collection, "CAM_V32_GAMEPLAY_LANE", (-15.8, -0.8, 1.72), (0.0, 0.0, 2.62), 31.0),
        "gameplay_north": create_camera(v31, collection, "CAM_V32_GAMEPLAY_NORTH", (-11.8, -1.3, 1.72), (0.0, 6.55, 2.78), 38.0),
        "gameplay_south": create_camera(v31, collection, "CAM_V32_GAMEPLAY_SOUTH", (11.8, 1.0, 1.72), (0.0, -7.15, 2.78), 38.0),
        "north_force": create_camera(v31, collection, "CAM_V32_NORTH_FORCE", (-4.8, 2.35, 3.25), (0.05, 7.25, 3.18), 47.0),
        "south_tension": create_camera(v31, collection, "CAM_V32_SOUTH_TENSION", (4.70, -2.55, 3.68), (0.25, -7.30, 3.18), 48.0),
        "baffle_detail": create_camera(v31, collection, "CAM_V32_BAFFLE", (14.2, 0.75, 3.18), (10.5, 5.60, 1.48), 50.0),
        "cover_detail": create_camera(v31, collection, "CAM_V32_COVER", (18.5, 3.25, 2.85), (15.5, 8.0, 1.20), 52.0),
        "overhead_context": create_camera(v31, collection, "CAM_V32_CONTEXT", (-14.0, -6.5, 6.35), (0.0, -0.3, 2.20), 35.0),
    }


def add_light(v31, collection, name, location, target, energy, color, size):
    light = v31.add_area_light(name, location, target, energy, color, size, collection)
    light["kyx_scope"] = SCOPE
    light["kyx_role"] = "v3_2_readability_light"
    if any(token in name for token in ("FACE", "FILL", "OVERHEAD", "PAPER", "COVER")):
        light.data.use_shadow = False
    return light


def configure_lighting(v31, collection) -> None:
    scene = bpy.context.scene
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.012, 0.016, 0.020, 1.0)
    background.inputs["Strength"].default_value = 0.34
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.75
    lights = (
        ("V32_LANE_OVERHEAD", (0.0, 0.0, 8.2), (0.0, 0.0, 1.4), 1450.0, (0.62, 0.76, 0.80), 8.0),
        ("V32_NORTH_KEY", (-5.0, 2.0, 7.8), (0.0, 7.35, 2.9), 1850.0, (1.0, 0.70, 0.48), 4.6),
        ("V32_NORTH_FACE", (0.0, 2.2, 5.8), (0.0, 7.15, 3.0), 1550.0, (0.72, 0.86, 0.92), 3.8),
        ("V32_NORTH_RIM", (5.2, 5.5, 7.0), (0.0, 7.35, 3.1), 1150.0, (0.24, 0.74, 0.82), 3.4),
        ("V32_NORTH_PAPER", (-1.4, 7.6, 5.9), (-0.42, 7.4, 3.0), 680.0, (1.0, 0.76, 0.50), 2.3),
        ("V32_SOUTH_KEY", (-4.8, -2.1, 7.4), (0.0, -7.35, 2.9), 1750.0, (1.0, 0.62, 0.42), 4.4),
        ("V32_SOUTH_FACE", (0.0, -2.1, 5.8), (0.0, -7.25, 3.0), 1450.0, (0.70, 0.84, 0.90), 3.8),
        ("V32_SOUTH_RIM", (5.0, -6.5, 7.0), (0.0, -7.35, 3.2), 1050.0, (0.30, 0.76, 0.82), 3.2),
        ("V32_GUARD_FILL", (10.5, 1.7, 5.3), (10.5, 5.6, 1.5), 900.0, (0.55, 0.76, 0.80), 3.5),
        ("V32_COVER_FILL", (18.0, 6.0, 4.4), (15.5, 8.0, 1.2), 820.0, (1.0, 0.58, 0.36), 2.8),
    )
    for values in lights:
        add_light(v31, collection, *values)


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


def render_set(output_root: Path, cameras: dict[str, bpy.types.Object], views: list[str], mode: str) -> list[dict[str, Any]]:
    scene = bpy.context.scene
    results = []
    render_dir = output_root / "readability-v3-2/renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    for view in views:
        path = render_dir / f"inkfall-press-hall-v3-2-{view}-{mode}.png"
        scene.camera = cameras[view]
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view, "mode": mode, "path": path})
    return results


def neutral_state(enable: bool, saved: dict[str, Any] | None = None) -> dict[str, Any] | None:
    scene = bpy.context.scene
    background = scene.world.node_tree.nodes.get("Background")
    if enable:
        state = {
            "exposure": scene.view_settings.exposure,
            "look": scene.view_settings.look,
            "worldColor": tuple(background.inputs["Color"].default_value),
            "worldStrength": float(background.inputs["Strength"].default_value),
            "lights": [(obj, float(obj.data.energy), tuple(obj.data.color)) for obj in bpy.data.objects if obj.type == "LIGHT"],
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
        raise RuntimeError("Missing neutral-light restore state")
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
        raise RuntimeError("Review boards require exactly four views")
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
    board = bpy.data.images.new(f"G5_V32_BOARD_{board_id}", width=width, height=height, alpha=True)
    board.pixels.foreach_set(canvas)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.filepath_raw = str(output_path)
    board.file_format = "PNG"
    board.save()


def export_glb(output_path: Path, *, draco: bool) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.hide_render or obj.get("kyx_collision") not in {False, None}:
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("No render-only objects selected")
    bpy.context.view_layer.objects.active = selected[0]
    kwargs = {
        "filepath": str(output_path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_cameras": False,
        "export_lights": False,
    }
    if draco:
        kwargs.update({
            "export_draco_mesh_compression_enable": True,
            "export_draco_mesh_compression_level": 6,
            "export_draco_position_quantization": 14,
            "export_draco_normal_quantization": 10,
            "export_draco_texcoord_quantization": 12,
        })
    try:
        bpy.ops.export_scene.gltf(**kwargs)
        result = {"status": "PASS", "path": output_path, "bytes": output_path.stat().st_size}
    except Exception as exc:
        result = {"status": "UNAVAILABLE", "error": f"{type(exc).__name__}: {exc}"}
    bpy.ops.object.select_all(action="DESELECT")
    return result


def spatial_module(obj: bpy.types.Object) -> str:
    center = obj.matrix_world.translation
    if center.y > 3.0:
        return "north"
    if center.y < -3.0:
        return "south"
    return "center_east" if center.x >= 0.0 else "center_west"


def join_static_by_spatial_material() -> dict[str, Any]:
    """Join the derived export scene while the named authoring source stays saved."""
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.hide_render and obj.get("kyx_collision") in {False, None}
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in candidates:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = candidates[0]
    # Bake bevel/solidify and other render modifiers before consolidation so the
    # optimized candidate keeps the same evaluated silhouettes as the source.
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
        merged.name = f"V32OPT_{module.upper()}_{safe_material}"
        merged["kyx_scope"] = SCOPE
        merged["kyx_role"] = "v3_2_spatial_material_joined_export"
        merged["kyx_spatial_module"] = module
        joined.append({"object": merged.name, "module": module, "material": material, "sourceObjectCount": len(objects)})
    bpy.ops.object.select_all(action="DESELECT")
    return {"groupCount": len(joined), "groups": joined, "sourceMeshObjectCount": len(candidates)}


def glb_payload_metrics(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        magic, version, declared_length = struct.unpack("<4sII", handle.read(12))
        document = None
        while handle.tell() < declared_length:
            chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
            chunk = handle.read(chunk_length)
            if chunk_type == 0x4E4F534A:
                document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\x00"))
                break
    if magic != b"glTF" or version != 2 or document is None:
        raise RuntimeError(f"Unable to parse GLB JSON: {path}")
    accessors = document.get("accessors", [])
    primitive_count = 0
    position_vertices = 0
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is not None:
                position_vertices += int(accessors[position_index].get("count", 0))
            mode = int(primitive.get("mode", 4))
            if mode == 4:
                index_accessor = primitive.get("indices")
                if index_accessor is not None:
                    triangles += int(accessors[index_accessor].get("count", 0)) // 3
                elif position_index is not None:
                    triangles += int(accessors[position_index].get("count", 0)) // 3
    return {
        "bytes": path.stat().st_size,
        "declaredBytes": declared_length,
        "nodeCount": len(document.get("nodes", [])),
        "meshCount": len(document.get("meshes", [])),
        "primitiveCount": primitive_count,
        "drawCallProxy": primitive_count,
        "summedPositionVertices": position_vertices,
        "triangleCount": triangles,
        "materialCount": len(document.get("materials", [])),
        "textureCount": len(document.get("textures", [])),
        "imageCount": len(document.get("images", [])),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
    }


def payload_metrics() -> dict[str, Any]:
    visible = [obj for obj in bpy.context.scene.objects if not obj.hide_render and obj.type in {"MESH", "CURVE"} and obj.get("kyx_collision") in {False, None}]
    mesh_objects = [obj for obj in visible if obj.type == "MESH"]
    vertices = 0
    triangles = 0
    material_refs = 0
    unique_materials = set()
    draw_call_proxy = 0
    for obj in mesh_objects:
        mesh = obj.data
        vertices += len(mesh.vertices)
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        slots = {slot.material.name for slot in obj.material_slots if slot.material is not None}
        material_refs += len(obj.material_slots)
        unique_materials.update(slots)
        draw_call_proxy += max(1, len(slots))
    node_count = 0
    for name in unique_materials:
        material = bpy.data.materials.get(name)
        if material and material.use_nodes and material.node_tree:
            node_count += len(material.node_tree.nodes)
    return {
        "renderObjectCount": len(visible),
        "meshObjectCount": len(mesh_objects),
        "curveObjectCount": len(visible) - len(mesh_objects),
        "vertexInstanceCount": vertices,
        "triangleInstanceCount": triangles,
        "materialSlotReferenceCount": material_refs,
        "uniqueUsedMaterialCount": len(unique_materials),
        "usedMaterialNodeCount": node_count,
        "drawCallProxy": draw_call_proxy,
        "drawCallProxyDefinition": "sum of at least one draw per visible mesh object and one per distinct assigned material slot",
        "runtimePerformanceMeasured": False,
    }


def image_luminance(path: Path) -> dict[str, float]:
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    pixels = array("f", [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    values = []
    stride = max(1, (width * height) // 100000)
    for pixel_index in range(0, width * height, stride):
        base = pixel_index * 4
        values.append(0.2126 * pixels[base] + 0.7152 * pixels[base + 1] + 0.0722 * pixels[base + 2])
    values.sort()
    count = len(values)
    return {
        "mean": round(sum(values) / count, 6),
        "p10": round(values[int(count * 0.10)], 6),
        "median": round(values[int(count * 0.50)], 6),
        "p90": round(values[int(count * 0.90)], 6),
        "shadowFractionBelow0035": round(sum(value < 0.035 for value in values) / count, 6),
    }


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"Invalid PNG: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise RuntimeError(f"Missing IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def artifact(path: Path, repo_root: Path, include_resolution=False) -> dict[str, Any]:
    result = {"path": path.relative_to(repo_root).as_posix(), "sha256": sha256_file(path), "bytes": path.stat().st_size}
    if include_resolution:
        result["resolution"] = png_dimensions(path)
    return result


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    final_before = verify_hash_set(repo_root)
    v31 = import_v31(repo_root)
    v1 = v31.import_v1_builder(repo_root)
    p67_before = v1.verify_inputs(repo_root)
    bpy.ops.wm.open_mainfile(filepath=str(repo_root / FROZEN_FINAL["source"][0]), load_ui=False)

    removed_rig = {
        "cameras": remove_collection_objects("G5_V3_FINAL_REVIEW_CAMERAS"),
        "lights": remove_collection_objects("G5_V3_FINAL_REVIEW_LIGHTING"),
    }
    camera_collection = v31.make_collection("G5_V3_2_READABILITY_CAMERAS")
    light_collection = v31.make_collection("G5_V3_2_READABILITY_LIGHTING")
    cameras = configure_cameras(v31, camera_collection)
    configure_lighting(v31, light_collection)
    configure_render()
    scene = bpy.context.scene
    scene["kyx_scope"] = SCOPE
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_visual_decision"] = VISUAL_DECISION
    scene["kyx_parent_art_candidate"] = "inkfall_foundry_press_hall_final_art_v3_conditional"
    scene["kyx_readability_revision"] = "3.2"
    scene["kyx_product_selectable"] = False
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_authority_collision_included"] = False

    source_path = output_root / "readability-v3-2/source/inkfall_foundry_press_hall_readability_v3_2.blend"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    color_views = list(cameras)
    color_results = render_set(output_root, cameras, color_views, "color")
    diagnostic_views = ["gameplay_north", "gameplay_south", "north_force", "south_tension"]
    state = neutral_state(True)
    diagnostic_results = render_set(output_root, cameras, diagnostic_views, "neutral")
    neutral_state(False, state)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)

    color_by_view = {item["view"]: item["path"] for item in color_results}
    diagnostic_by_view = {item["view"]: item["path"] for item in diagnostic_results}
    boards = [
        ("gameplay", output_root / "readability-v3-2/boards/inkfall-press-hall-v3-2-gameplay-readability-board.png", [color_by_view[key] for key in ("gameplay_lane", "gameplay_north", "gameplay_south", "overhead_context")]),
        ("mechanical", output_root / "readability-v3-2/boards/inkfall-press-hall-v3-2-mechanical-readability-board.png", [color_by_view[key] for key in ("north_force", "south_tension", "baffle_detail", "cover_detail")]),
        ("neutral_diagnostic", output_root / "readability-v3-2/boards/inkfall-press-hall-v3-2-neutral-diagnostic-board.png", [diagnostic_by_view[key] for key in diagnostic_views]),
    ]
    for board_id, path, images in boards:
        create_board(path, images, board_id)

    metrics = payload_metrics()
    export_dir = output_root / "readability-v3-2/export"
    standard_export = export_glb(export_dir / "inkfall_foundry_press_hall_readability_v3_2.glb", draco=False)
    if standard_export["status"] != "PASS":
        raise RuntimeError(f"Standard staged GLB export failed: {standard_export}")
    standard_glb_metrics = glb_payload_metrics(standard_export["path"])
    optimization = join_static_by_spatial_material()
    optimized_source = output_root / "readability-v3-2/source/inkfall_foundry_press_hall_readability_v3_2.optimized-export.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(optimized_source), check_existing=False)
    optimized_export = export_glb(export_dir / "inkfall_foundry_press_hall_readability_v3_2.spatial-material-joined.glb", draco=False)
    if optimized_export["status"] != "PASS":
        raise RuntimeError(f"Spatial/material joined GLB export failed: {optimized_export}")
    optimized_glb_metrics = glb_payload_metrics(optimized_export["path"])
    frozen_final_glb_metrics = glb_payload_metrics(repo_root / FROZEN_FINAL["glb"][0])
    # Return to the named, unjoined source for contract validation and final
    # evidence; the joined scene remains preserved separately above.
    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False)

    frozen_north = repo_root / FROZEN_FINAL["north_force"][0]
    luminance = {
        "frozenFinalNorthForce": image_luminance(frozen_north),
        "v32NorthForceColor": image_luminance(color_by_view["north_force"]),
        "v32NorthForceNeutral": image_luminance(diagnostic_by_view["north_force"]),
        "v32GameplayNorthColor": image_luminance(color_by_view["gameplay_north"]),
        "v32GameplaySouthColor": image_luminance(color_by_view["gameplay_south"]),
    }
    p67_after = v1.verify_inputs(repo_root)
    final_after = verify_hash_set(repo_root)
    constants_text = (repo_root / "src/content/maps/constants.ts").read_text(encoding="utf-8")
    collision_objects = sorted(obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None})
    envelope_results = v1.validate_replacement_envelopes()
    render_artifacts = [artifact(item["path"], repo_root, True) | {"view": item["view"], "mode": item["mode"]} for item in [*color_results, *diagnostic_results]]
    board_artifacts = [artifact(path, repo_root, True) | {"id": board_id} for board_id, path, _ in boards]
    source_artifact = artifact(source_path, repo_root)
    optimized_source_artifact = artifact(optimized_source, repo_root)
    standard_artifact = artifact(standard_export["path"], repo_root)
    optimized_artifact = artifact(optimized_export["path"], repo_root)
    metrics["frozenFinalGlb"] = frozen_final_glb_metrics
    metrics["v32AuthoringGlb"] = standard_glb_metrics
    metrics["v32SpatialMaterialJoinedGlb"] = optimized_glb_metrics
    metrics["spatialMaterialJoin"] = optimization
    metrics["optimizedByteReductionFraction"] = round(1.0 - optimized_artifact["bytes"] / standard_artifact["bytes"], 6)
    metrics["compression"] = {
        "applied": False,
        "reason": "No repository/runtime proof of KHR_draco_mesh_compression or EXT_meshopt_compression loader support; compression intentionally not applied",
    }

    old_luma = luminance["frozenFinalNorthForce"]
    new_luma = luminance["v32NorthForceColor"]
    checks = {
        "frozenFinalPackageUnchanged": final_before == final_after,
        "p67InputsUnchanged": p67_before == p67_after,
        "catalogDefaultStillRevision1": "DEFAULT_MAP_REVISION = 1 as const" in constants_text,
        "authorityCollisionObjectsAbsent": collision_objects == [],
        "allReplacementEnvelopesContained": all(item["status"] == "PASS" for item in envelope_results),
        "northForceReadabilityImproved": new_luma["mean"] >= old_luma["mean"] * 1.45 and new_luma["shadowFractionBelow0035"] <= old_luma["shadowFractionBelow0035"] * 0.78,
        "gameplayEyeMechanismViewsRendered": abs(bpy.data.objects["CAM_V32_GAMEPLAY_NORTH"].location.z - 1.72) < 1e-6 and abs(bpy.data.objects["CAM_V32_GAMEPLAY_SOUTH"].location.z - 1.72) < 1e-6,
        "eightColorReadabilityViewsRendered": len(color_results) == 8 and all(item["resolution"] == [1600, 900] for item in render_artifacts if item["mode"] == "color"),
        "fourNeutralDiagnosticViewsRendered": len(diagnostic_results) == 4 and all(item["resolution"] == [1600, 900] for item in render_artifacts if item["mode"] == "neutral"),
        "threeReviewBoardsRendered": len(board_artifacts) == 3 and all(item["resolution"] == [1920, 1080] for item in board_artifacts),
        "payloadMetricsRecorded": all(metrics[key] > 0 for key in ("meshObjectCount", "vertexInstanceCount", "triangleInstanceCount", "uniqueUsedMaterialCount", "usedMaterialNodeCount", "drawCallProxy")),
        "standardStagedGlbWritten": standard_artifact["bytes"] > 1024,
        "spatialMaterialJoinedExportUnder50Primitives": optimized_glb_metrics["primitiveCount"] <= 50,
        "optimizedExportPreservesTriangleCount": optimized_glb_metrics["triangleCount"] == standard_glb_metrics["triangleCount"],
        "compressionWithheldWithoutLoaderProof": metrics["compression"]["applied"] is False and not ({"KHR_draco_mesh_compression", "EXT_meshopt_compression"} & set(optimized_glb_metrics["extensionsUsed"])),
    }
    status = "BOUNDED_PRESS_HALL_V3_2_READABILITY_BUILD_PASS" if all(checks.values()) else "BOUNDED_PRESS_HALL_V3_2_READABILITY_BUILD_FAIL"
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_v3_2_readability_build_report",
        "status": status,
        "scope": SCOPE,
        "visualDecision": VISUAL_DECISION,
        "checks": checks,
        "binding": {
            "mapId": "inkfall_foundry", "grayboxRevision": 2, "grayboxLockRevision": 1,
            "catalogDefaultRevision": 1, "parentArtCandidate": "inkfall_foundry_press_hall_final_art_v3_conditional",
            "productSelectable": False, "runtimeIntegrated": False, "shippingDefault": False,
        },
        "generator": {"id": GENERATOR_ID, "version": "3.2", "blenderVersion": bpy.app.version_string, "builderSha256": sha256_file(Path(__file__).resolve())},
        "frozenFinalBefore": final_before,
        "frozenFinalAfter": final_after,
        "preservedP67Before": p67_before,
        "preservedP67After": p67_after,
        "removedFrozenReviewRigFromDerivedSource": removed_rig,
        "replacementEnvelopeValidation": envelope_results,
        "collisionObjects": collision_objects,
        "imageLuminanceDiagnostics": luminance,
        "payloadMetrics": metrics,
        "optimization": {
            "authoringSourcePreserved": True,
            "joinedExportSource": optimized_source_artifact,
            "compressionApplied": False,
            "loaderSupportProven": False,
        },
        "artifacts": {
            "sourceBlend": source_artifact,
            "optimizedExportBlend": optimized_source_artifact,
            "standardRenderGlb": standard_artifact,
            "spatialMaterialJoinedRenderGlb": optimized_artifact,
            "renders": render_artifacts,
            "boards": board_artifacts,
        },
        "knownBlockers": [
            "parent final visual review is still required",
            "runtime performance, draw calls, frame time, shader cost, memory, and no-snag behavior are not measured",
            "drawCallProxy is an offline structural estimate and not an engine capture",
            "the optimized GLB is staged evidence only and is not runtime integrated",
            "mesh compression is withheld until loader support is proven",
        ],
        "nonClaims": NON_CLAIMS,
    }
    report_path = output_root / "readability-v3-2/validation/press-hall-readability-v3-2-build-report.json"
    stable_json(report_path, report)
    manifest = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_staged_readability_preview_manifest",
        "id": GENERATOR_ID,
        "status": "bounded_readability_candidate_pending_parent_final_review_non_default" if all(checks.values()) else "bounded_readability_candidate_build_failed",
        "scope": SCOPE,
        "visualDecision": VISUAL_DECISION,
        "binding": report["binding"],
        "source": {"builder": {"path": Path(__file__).resolve().relative_to(repo_root).as_posix(), "sha256": sha256_file(Path(__file__).resolve())}, "blend": source_artifact},
        "stagedExports": {"standard": standard_artifact, "spatialMaterialJoined": optimized_artifact},
        "reviewRenders": render_artifacts,
        "reviewBoards": board_artifacts,
        "validation": {"buildReport": artifact(report_path, repo_root) | {"status": status}, "independentVerifier": {"path": "tools/evidence/verify-inkfall-g5-press-hall-readability-v3-2.py"}, "independentReport": {"path": "evidence/2026-07-22/phase-6-g5-press-hall-readability-v3-2/independent-verification.json", "status": "PENDING"}},
        "nonClaims": NON_CLAIMS,
    }
    manifest_path = output_root / "readability-v3-2/manifest.press-hall-readability-v3-2.json"
    stable_json(manifest_path, manifest)
    print("PRESS_HALL_V3_2_READABILITY=" + json.dumps({"status": status, "visualDecision": VISUAL_DECISION, "report": str(report_path), "manifest": str(manifest_path), "optimizedPrimitives": optimized_glb_metrics["primitiveCount"]}, sort_keys=True))
    if not all(checks.values()):
        raise RuntimeError(f"Press Hall v3.2 readability build failed: {[key for key, value in checks.items() if not value]}")


if __name__ == "__main__":
    main()
