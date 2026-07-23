"""Build the early v3 Press Hall hero-machinery checkpoint.

This is deliberately not a v2 dressing pass.  It opens the exact verified v1
source, removes the two inherited reactor replacements and unsupported hanging
paper, builds new functional presses, and writes only to the v3 checkpoint path.
No runtime catalog, collision authority, spawn, route, or shipping state is used
or modified.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


SCOPE = "G5_PRESS_HALL_V3_1_HERO_CHECKPOINT_PREVIEW_ONLY"
GENERATOR_ID = "inkfall_foundry_press_hall_hero_checkpoint_v3_1"
V1_BLEND = (
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/source/inkfall_foundry_press_hall_final_art_v1.blend",
    "e1d186c630bd87ee6c68b58427ba095086bae57bcf4daa147afbd859d7f92495",
)
PRESERVED_V1 = {
    "blend": V1_BLEND,
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/export/inkfall_foundry_press_hall_final_art_v1.glb",
        "7078294365656fc6a16a5581b8cf5ae7a4477590c2125bbbad69e94d1e509e4e",
    ),
    "build_report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/validation/press-hall-final-art-v1-build-report.json",
        "b24a47f353b32ca97f4ec5aadb17a5ffc1d6c400770277ab626c8ed8764a67ca",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/manifest.press-hall-final-art-v1.json",
        "bb2a3332fd22afb64d8bef82c71e311f336631ded793f2448f9014a50626dfbe",
    ),
}
PRESERVED_REJECTED_V2 = {
    "blend": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/source/inkfall_foundry_press_hall_final_art_v2.blend",
        "a268331d8ca016a7b9ebeaa4e9b16d14d155ce7a532196e2590acce0debbc0ce",
    ),
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/export/inkfall_foundry_press_hall_final_art_v2.glb",
        "542ad773414b3d42794b3550440e2555369ae82c174bf24e2fe37470803a2a8a",
    ),
    "build_report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/validation/press-hall-final-art-v2-build-report.json",
        "e456a5987c035f2ed0b1cf69699763620228fde79b655d2b1e731d73f430181c",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/manifest.press-hall-final-art-v2.json",
        "1daf91b5d6ad36d916692a1e8eb8ee59605e48e11508fb338b18c7febfbc7a2a",
    ),
    "strict_review": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/STRICT_SELF_REVIEW.md",
        "69a379f507d6e5d5acb6d28385150808aea51cabb0ecdd3e359f9270bf8d8a57",
    ),
}
PRESERVED_V3_CHECKPOINT = {
    "source": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/source/inkfall_foundry_press_hall_hero_checkpoint_v3.blend",
        "9fefd3dbb974de9526a65db97804fb7f38190adf7e20df5909bb117cfec676e4",
    ),
    "report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/validation/press-hall-v3-hero-checkpoint-build-report.json",
        "6e6669b5477b3bc36327ed7e71041b535cee640848341c6a8c9e395dee2eaece",
    ),
    "board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/boards/inkfall-press-hall-v3-hero-checkpoint-board.png",
        "2dec840b61d859a88b43c870c1795b6e818f4908e79c60927f794eba7610fb15",
    ),
    "gameplay": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/renders/inkfall-press-hall-v3-gameplay_eye.png",
        "91001f5acb75e742ddc98aca0d9d55146e33e0f01687eb10d6621b3ede496e41",
    ),
    "hero_close": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/renders/inkfall-press-hall-v3-hero_close.png",
        "376435fedac03d651e778782ebffd656008e4c344b0890abe6701744111bb39a",
    ),
    "context": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint/renders/inkfall-press-hall-v3-overhead_context.png",
        "4a3f907a3276c22c23fc8375cc351676fe222d124bdd52f2820d66d757c5f27c",
    ),
}
REACTOR_TARGETS = {
    "north": "R_MODULE__PRESS_REACTOR_NORTH",
    "south": "R_MODULE__PRESS_REACTOR_SOUTH",
}
UNSUPPORTED_PAPER_PREFIXES = (
    "PH_HANGING_PAPER_",
    "PH_HANGING_PAPER_SPINE_",
    "PAPER_DROP_HANGING_SHEET_",
)
ORGANIC_GARDEN_PREFIXES = ("PAPER_DROP_GARDEN_CONDUIT_", "PAPER_DROP_GARDEN_LEAF_")
CHECKPOINT_HIDDEN_TARGETS = {
    "R_MODULE__PRESS_BAFFLE_E_INNER",
    "R_MODULE__PRESS_BAFFLE_W_INNER",
}


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


def verify_hash_set(repo_root: Path, expected: dict[str, tuple[str, str]]) -> dict[str, dict[str, str]]:
    results = {}
    for key, (relative, expected_sha) in expected.items():
        path = repo_root / relative
        actual_sha = sha256_file(path)
        if actual_sha != expected_sha:
            raise RuntimeError(f"Preserved input drift: {key}: expected {expected_sha}, got {actual_sha}")
        results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
    return results


def stable_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def import_v1_builder(repo_root: Path):
    path = repo_root / "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/build_press_hall_final_art_v1.py"
    spec = importlib.util.spec_from_file_location("inkfall_press_hall_v1_builder_for_v3", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import verified v1 builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def make_used_material(
    name: str,
    semantic_slot: str,
    dark: tuple[float, float, float, float],
    light: tuple[float, float, float, float],
    *,
    metallic: float,
    rough_min: float,
    rough_max: float,
    scale: float,
    bump: float,
    emission: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material["kyx_material_slot"] = semantic_slot
    material["kyx_scope"] = SCOPE
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    coordinate = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    ramp = nodes.new("ShaderNodeValToRGB")
    rough_map = nodes.new("ShaderNodeMapRange")
    detail_noise = nodes.new("ShaderNodeTexNoise")
    bump_node = nodes.new("ShaderNodeBump")
    coordinate.location = (-760, 20)
    noise.location = (-570, 80)
    ramp.location = (-350, 120)
    rough_map.location = (-130, -40)
    detail_noise.location = (-560, -210)
    bump_node.location = (-100, -190)
    principled.location = (150, 60)
    output.location = (430, 60)
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].position = 0.76
    ramp.color_ramp.elements[1].color = light
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 1.0
    rough_map.inputs["To Min"].default_value = rough_min
    rough_map.inputs["To Max"].default_value = rough_max
    detail_noise.inputs["Scale"].default_value = scale * 9.0
    detail_noise.inputs["Detail"].default_value = 3.0
    bump_node.inputs["Strength"].default_value = bump
    bump_node.inputs["Distance"].default_value = 0.045
    principled.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        principled.inputs["Emission Color"].default_value = light
        principled.inputs["Emission Strength"].default_value = emission
    # Object coordinates keep elongated posts from stretching noise into a
    # misleading wood grain; the resulting breakup reads as cast-metal pitting.
    links.new(coordinate.outputs["Object"], noise.inputs["Vector"])
    links.new(coordinate.outputs["Object"], detail_noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], rough_map.inputs["Value"])
    links.new(rough_map.outputs["Result"], principled.inputs["Roughness"])
    links.new(detail_noise.outputs["Fac"], bump_node.inputs["Height"])
    links.new(bump_node.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "cast": make_used_material("V3_CAST_IRON", "env_secondary_metal", (0.008, 0.013, 0.016, 1), (0.095, 0.135, 0.145, 1), metallic=0.92, rough_min=0.34, rough_max=0.57, scale=11.0, bump=0.075),
        "steel": make_used_material("V3_WORN_STEEL", "env_secondary_metal", (0.040, 0.048, 0.052, 1), (0.30, 0.34, 0.33, 1), metallic=0.96, rough_min=0.20, rough_max=0.50, scale=15.0, bump=0.045),
        "grease": make_used_material("V3_GREASED_LINKAGE", "env_ink_surface", (0.001, 0.002, 0.003, 1), (0.035, 0.026, 0.017, 1), metallic=0.28, rough_min=0.16, rough_max=0.48, scale=5.5, bump=0.07),
        "ink": make_used_material("V3_INK_BLACK", "env_ink_surface", (0.001, 0.003, 0.005, 1), (0.025, 0.035, 0.042, 1), metallic=0.08, rough_min=0.28, rough_max=0.83, scale=2.2, bump=0.18),
        "paper": make_used_material("V3_FIBROUS_PAPER", "env_base_ceramic", (0.34, 0.25, 0.14, 1), (0.83, 0.67, 0.41, 1), metallic=0.0, rough_min=0.70, rough_max=0.96, scale=7.5, bump=0.28),
        "ceramic": make_used_material("V3_USED_CERAMIC", "env_base_ceramic", (0.24, 0.23, 0.20, 1), (0.64, 0.58, 0.47, 1), metallic=0.02, rough_min=0.58, rough_max=0.88, scale=4.2, bump=0.18),
        "safety": make_used_material("V3_CHIPPED_SAFETY_RED", "env_vermilion_safety", (0.16, 0.012, 0.006, 1), (0.72, 0.060, 0.018, 1), metallic=0.24, rough_min=0.35, rough_max=0.72, scale=8.0, bump=0.12),
        "amber": make_used_material("V3_WORN_AMBER", "env_functional_marking", (0.24, 0.10, 0.008, 1), (0.95, 0.47, 0.025, 1), metallic=0.18, rough_min=0.34, rough_max=0.68, scale=9.0, bump=0.09),
        "rubber": make_used_material("V3_RUBBER_BELT", "env_secondary_metal", (0.002, 0.003, 0.004, 1), (0.025, 0.028, 0.030, 1), metallic=0.0, rough_min=0.58, rough_max=0.91, scale=13.0, bump=0.10),
        "aqua": make_used_material("V3_AQUA_INDICATOR", "env_emissive_signage", (0.004, 0.12, 0.12, 1), (0.035, 0.72, 0.66, 1), metallic=0.0, rough_min=0.25, rough_max=0.42, scale=12.0, bump=0.03, emission=2.4),
        "garden": make_used_material("V3_GARDEN_FRAGMENT", "env_garden_fragment", (0.020, 0.045, 0.015, 1), (0.15, 0.27, 0.075, 1), metallic=0.0, rough_min=0.70, rough_max=0.94, scale=5.0, bump=0.20),
    }


def replace_context_materials(materials: dict[str, bpy.types.Material]) -> None:
    slot_map = {
        "env_base_ceramic": materials["ceramic"],
        "env_secondary_metal": materials["cast"],
        "env_ink_surface": materials["ink"],
        "env_vermilion_safety": materials["safety"],
        "env_functional_marking": materials["amber"],
        "env_emissive_signage": materials["aqua"],
        "env_garden_fragment": materials["garden"],
    }
    for obj in bpy.data.objects:
        data = getattr(obj, "data", None)
        slots = getattr(data, "materials", None)
        if slots is None:
            continue
        for index, material in enumerate(list(slots)):
            if material is None:
                continue
            semantic = material.get("kyx_material_slot")
            if semantic in slot_map:
                slots[index] = slot_map[str(semantic)]


def tag(
    obj: bpy.types.Object,
    family: str,
    *,
    target: str | None = None,
    support_target: str | None = None,
    support_count: int | None = None,
) -> bpy.types.Object:
    obj["kyx_scope"] = SCOPE
    obj["kyx_collision"] = False
    obj["kyx_v3_family"] = family
    obj["kyx_role"] = "v3_checkpoint_render_only"
    if target:
        obj["kyx_replacement_target"] = target
    if support_target:
        obj["kyx_support_target"] = support_target
    if support_count is not None:
        obj["kyx_support_count"] = support_count
    return obj


def remove_inherited_reactors_and_floaters() -> dict[str, list[str]]:
    removed = {"reactor": [], "unsupportedPaper": [], "organicGardenClutter": [], "checkpointHiddenBaffles": [], "reviewRig": []}
    for obj in list(bpy.data.objects):
        target = obj.get("kyx_replacement_target")
        if target in set(REACTOR_TARGETS.values()):
            removed["reactor"].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith(UNSUPPORTED_PAPER_PREFIXES):
            removed["unsupportedPaper"].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith(ORGANIC_GARDEN_PREFIXES):
            removed["organicGardenClutter"].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
        elif target in CHECKPOINT_HIDDEN_TARGETS:
            obj.hide_render = True
            removed["checkpointHiddenBaffles"].append(obj.name)
        elif any(collection.name in {"G5_REVIEW_CAMERAS", "G5_REVIEW_LIGHTING"} for collection in obj.users_collection):
            removed["reviewRig"].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return {key: sorted(value) for key, value in removed.items()}


def add_cast_arc(
    name: str,
    center_xz: tuple[float, float],
    y_center: float,
    depth: float,
    outer_radius: float,
    inner_radius: float,
    start_degrees: float,
    end_degrees: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    v1,
    target: str,
    family: str = "cast_frame",
) -> bpy.types.Object:
    steps = max(18, int(abs(end_degrees - start_degrees) / 4.0))
    angles = [math.radians(start_degrees + (end_degrees - start_degrees) * i / steps) for i in range(steps + 1)]
    cx, cz = center_xz
    vertices = []
    for y in (y_center - depth * 0.5, y_center + depth * 0.5):
        for radius in (outer_radius, inner_radius):
            vertices.extend((cx + math.cos(angle) * radius, y, cz + math.sin(angle) * radius) for angle in angles)
    ring = steps + 1
    no, ni, fo, fi = 0, ring, ring * 2, ring * 3
    faces = []
    for index in range(steps):
        nxt = index + 1
        faces.extend([
            (no + index, fo + index, fo + nxt, no + nxt),
            (ni + nxt, fi + nxt, fi + index, ni + index),
            (fo + index, fi + index, fi + nxt, fo + nxt),
            (no + nxt, ni + nxt, ni + index, no + index),
        ])
    faces.extend([(no, ni, fi, fo), (no + steps, fo + steps, fi + steps, ni + steps)])
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    v1.add_bevel(obj, 0.065, 3)
    return tag(obj, family, target=target)


def add_target_beam(name, start, end, radius, collection, material, v1, target, family, support_target=None):
    obj = v1.add_beam_between(name, start, end, radius, collection, material, vertices=20, role="v3_checkpoint_render_only")
    return tag(obj, family, target=target, support_target=support_target)


def add_target_box(name, dimensions, location, collection, material, v1, target, family, bevel=0.06, rotation_z=0.0, support_target=None):
    obj = v1.add_box(name, dimensions, location, collection, material, bevel=bevel, rotation_z=rotation_z, role="v3_checkpoint_render_only", replacement_target=target)
    return tag(obj, family, target=target, support_target=support_target)


def add_target_cylinder(name, radius, depth, location, collection, material, v1, target, family, rotation=(0.0, 0.0, 0.0), bevel=0.025, support_target=None):
    obj = v1.add_cylinder(name, radius, depth, location, collection, material, vertices=40, rotation=rotation, bevel=bevel, role="v3_checkpoint_render_only", replacement_target=target)
    return tag(obj, family, target=target, support_target=support_target)


def add_gear(name, center, radius, depth, teeth, collection, material, accent, v1, target) -> None:
    cx, cy, cz = center
    rim = v1.add_torus(name + "_RIM", radius * 0.78, radius * 0.13, center, collection, material, rotation=(math.pi / 2.0, 0.0, 0.0), role="v3_checkpoint_render_only", replacement_target=target)
    tag(rim, "gear_linkage", target=target)
    hub = add_target_cylinder(name + "_HUB", radius * 0.22, depth, center, collection, accent, v1, target, "gear_linkage", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.025)
    for index in range(teeth):
        angle = 2.0 * math.pi * index / teeth
        tx = cx + math.cos(angle) * radius * 0.91
        tz = cz + math.sin(angle) * radius * 0.91
        tooth = add_target_box(name + f"_TOOTH_{index:02d}", (radius * 0.22, depth, radius * 0.17), (tx, cy, tz), collection, material, v1, target, "gear_linkage", bevel=0.018)
        tooth.rotation_euler[1] = -angle
    for index, angle in enumerate((0.0, math.pi / 3.0, 2.0 * math.pi / 3.0)):
        direction = Vector((math.cos(angle), 0.0, math.sin(angle)))
        a = Vector(center) - direction * radius * 0.62
        b = Vector(center) + direction * radius * 0.62
        add_target_beam(name + f"_SPOKE_{index}", tuple(a), tuple(b), radius * 0.055, collection, accent, v1, target, "gear_linkage")


def add_flywheel(name, center, radius, depth, collection, materials, v1, target) -> None:
    cx, cy, cz = center
    rim = v1.add_torus(name + "_FORGED_RIM", radius * 0.80, radius * 0.135, center, collection, materials["cast"], rotation=(math.pi / 2.0, 0.0, 0.0), role="v3_checkpoint_render_only", replacement_target=target)
    tag(rim, "powered_force_path", target=target)
    add_target_cylinder(name + "_SHAFT_BOSS", radius * 0.25, depth, center, collection, materials["steel"], v1, target, "powered_force_path", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.03)
    for index, angle in enumerate((0.0, math.pi / 3.0, 2.0 * math.pi / 3.0)):
        direction = Vector((math.cos(angle), 0.0, math.sin(angle)))
        a = Vector(center) - direction * radius * 0.62
        b = Vector(center) + direction * radius * 0.62
        add_target_beam(name + f"_FORGED_SPOKE_{index}", tuple(a), tuple(b), radius * 0.075, collection, materials["steel"], v1, target, "powered_force_path")


def add_paper_web(
    name: str,
    path_yz: list[tuple[float, float, float]],
    width: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    v1,
    target: str,
    support_count: int,
    x_center: float = 0.0,
) -> bpy.types.Object:
    vertices = []
    for y, z, twist in path_yz:
        vertices.append((x_center - width * 0.5, y, z - twist))
        vertices.append((x_center + width * 0.5, y, z + twist))
    faces = [(index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2) for index in range(len(path_yz) - 1)]
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    solidify = obj.modifiers.new("V3_PAPER_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.026
    solidify.offset = 0.0
    bevel = obj.modifiers.new("V3_PAPER_EDGE", "BEVEL")
    bevel.width = 0.022
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return tag(obj, "supported_paper_web", target=target, support_count=support_count)


def add_anchor_set(prefix, y_values, collection, materials, v1, target) -> None:
    index = 0
    for x in (-1.32, 1.32):
        for y in y_values:
            add_target_box(f"{prefix}_ANCHOR_SHOE_{index}", (0.66, 0.64, 0.27), (x, y, 0.15), collection, materials["cast"], v1, target, "anchored_base", bevel=0.085)
            for bolt_index, y_offset in enumerate((-0.16, 0.16)):
                add_target_cylinder(f"{prefix}_ANCHOR_BOLT_{index}_{bolt_index}", 0.073, 0.24, (x, y + y_offset, 0.31), collection, materials["steel"], v1, target, "fastener", bevel=0.014)
            index += 1


def add_frame_pair(prefix, y_front, y_back, collection, materials, v1, target, center_z=3.18) -> None:
    for token, y in (("FRONT", y_front), ("BACK", y_back)):
        add_cast_arc(f"{prefix}_CAST_ARCH_{token}", (0.0, center_z), y, 0.38, 1.58, 0.92, 0.0, 180.0, collection, materials["cast"], v1, target)
        left = [(-1.58, 0.30), (-0.92, 0.30), (-0.88, center_z + 0.16), (-1.48, center_z + 0.16)]
        right = [(-x, z) for x, z in reversed(left)]
        for side, profile in (("L", left), ("R", right)):
            obj = v1.add_profile_prism_xz(f"{prefix}_CAST_LEG_{token}_{side}", profile, 0.46, (0.0, y, 0.0), collection, materials["cast"], bevel=0.095, role="v3_checkpoint_render_only", replacement_target=target)
            tag(obj, "cast_frame", target=target)
            gusset_profile = [(-1.55, 0.31), (-0.82, 0.31), (-1.02, 1.18), (-1.49, 1.38)]
            if side == "R":
                gusset_profile = [(-x, z) for x, z in reversed(gusset_profile)]
            gusset = v1.add_profile_prism_xz(f"{prefix}_BASE_GUSSET_{token}_{side}", gusset_profile, 0.46, (0.0, y, 0.0), collection, materials["cast"], bevel=0.085, role="v3_checkpoint_render_only", replacement_target=target)
            tag(gusset, "cast_frame", target=target)
        add_target_box(f"{prefix}_CONNECTED_BASE_{token}", (2.94, 0.42, 0.30), (0.0, y, 0.34), collection, materials["cast"], v1, target, "anchored_base", bevel=0.10)
    for x in (-1.31, 1.31):
        for z, radius in ((0.56, 0.135), (1.28, 0.105), (4.08, 0.12)):
            add_target_beam(f"{prefix}_FRAME_TIE_{int((x+2)*10)}_{int(z*10)}", (x, y_front, z), (x, y_back, z), radius, collection, materials["steel"], v1, target, "frame_tie")


def build_north_forging_press(collection, paper_collection, materials, v1) -> None:
    target = REACTOR_TARGETS["north"]
    prefix = "V3_NORTH_FORGING_PRESS"
    add_anchor_set(prefix, (6.34, 8.62), collection, materials, v1, target)
    add_frame_pair(prefix, 6.24, 8.50, collection, materials, v1, target, center_z=3.20)

    # Literal production force path: rear motor -> journaled shaft -> flywheel
    # and eccentric -> connecting rod -> guided crosshead -> ram/platen/die.
    add_target_box(prefix + "_FORGED_CROWN", (2.70, 1.94, 0.52), (0.0, 7.42, 4.78), collection, materials["cast"], v1, target, "powered_force_path", bevel=0.13)
    add_target_cylinder(prefix + "_MAIN_SHAFT", 0.18, 2.20, (0.72, 7.22, 3.94), collection, materials["steel"], v1, target, "powered_force_path", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.025)
    add_target_cylinder(prefix + "_FRONT_BEARING_HOUSING", 0.32, 0.22, (0.72, 6.18, 3.94), collection, materials["cast"], v1, target, "bearing_housing", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.045)
    add_target_cylinder(prefix + "_REAR_DRIVE_MOTOR", 0.40, 0.54, (0.72, 8.52, 3.94), collection, materials["cast"], v1, target, "drive_motor", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.075)
    for fin_index, y in enumerate((8.31, 8.45, 8.59, 8.73)):
        fin = v1.add_torus(prefix + f"_MOTOR_COOLING_FIN_{fin_index}", 0.39, 0.032, (0.72, y, 3.94), collection, materials["steel"], rotation=(math.pi / 2.0, 0.0, 0.0), role="v3_checkpoint_render_only", replacement_target=target)
        tag(fin, "drive_motor", target=target)
    add_flywheel(prefix + "_POWER_FLYWHEEL", (0.72, 6.12, 3.94), 0.70, 0.20, collection, materials, v1, target)
    add_gear(prefix + "_GUARDED_PINION", (-0.55, 6.12, 3.62), 0.31, 0.17, 10, collection, materials["steel"], materials["amber"], v1, target)
    add_cast_arc(prefix + "_DRIVE_GUARD_ARC", (0.72, 3.94), 6.085, 0.10, 0.88, 0.78, -55.0, 235.0, collection, materials["safety"], v1, target, family="drive_guard")
    eccentric_pin = (0.38, 6.13, 3.62)
    add_target_cylinder(prefix + "_ECCENTRIC_PIN", 0.13, 0.18, eccentric_pin, collection, materials["amber"], v1, target, "powered_force_path", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.022)
    add_target_beam(prefix + "_CONNECTING_ROD", eccentric_pin, (0.02, 6.13, 3.08), 0.095, collection, materials["grease"], v1, target, "powered_force_path")
    for x in (-0.66, 0.66):
        add_target_cylinder(prefix + f"_CROSSHEAD_GUIDE_{'L' if x < 0 else 'R'}", 0.105, 1.65, (x, 7.42, 3.52), collection, materials["steel"], v1, target, "crosshead_guide", bevel=0.022)
        add_target_box(prefix + f"_GUIDE_SHOE_{'L' if x < 0 else 'R'}", (0.31, 0.46, 0.38), (x, 7.42, 3.08), collection, materials["grease"], v1, target, "crosshead_guide", bevel=0.055)
    add_target_box(prefix + "_GUIDED_CROSSHEAD", (1.58, 1.30, 0.40), (0.0, 7.42, 3.08), collection, materials["steel"], v1, target, "powered_force_path", bevel=0.095)
    add_target_cylinder(prefix + "_PRESS_RAM", 0.24, 0.72, (0.0, 7.42, 2.52), collection, materials["steel"], v1, target, "powered_force_path", bevel=0.028)
    add_target_box(prefix + "_MOVING_PLATEN", (2.12, 1.52, 0.30), (0.0, 7.42, 2.02), collection, materials["steel"], v1, target, "platen", bevel=0.105)
    add_target_box(prefix + "_LOWER_BOLSTER", (2.48, 1.76, 0.30), (0.0, 7.42, 1.24), collection, materials["cast"], v1, target, "platen", bevel=0.105)
    add_target_box(prefix + "_INK_DIE", (1.62, 1.22, 0.16), (0.0, 7.42, 1.47), collection, materials["ink"], v1, target, "ink_die", bevel=0.045)
    for x in (-0.94, 0.94):
        add_target_beam(prefix + f"_BOLSTER_KNEE_{'L' if x < 0 else 'R'}", (x, 7.12, 0.54), (x * 0.82, 7.34, 1.43), 0.13, collection, materials["cast"], v1, target, "cast_frame")

    for bolt_index, angle in enumerate(tuple(2.0 * math.pi * i / 8.0 for i in range(8))):
        bx = 0.72 + math.cos(angle) * 0.235
        bz = 3.94 + math.sin(angle) * 0.235
        add_target_cylinder(prefix + f"_BEARING_BOLT_{bolt_index}", 0.044, 0.11, (bx, 6.055, bz), collection, materials["amber"], v1, target, "fastener", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.010)
    handwheel = v1.add_torus(prefix + "_HANDWHEEL", 0.28, 0.035, (1.34, 6.06, 2.13), collection, materials["safety"], rotation=(math.pi / 2.0, 0.0, 0.0), role="v3_checkpoint_render_only", replacement_target=target)
    tag(handwheel, "service_control", target=target)
    add_target_cylinder(prefix + "_HANDWHEEL_HUB", 0.09, 0.14, (1.34, 6.10, 2.13), collection, materials["steel"], v1, target, "service_control", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.018)
    add_target_box(prefix + "_SERVICE_HATCH", (0.42, 0.08, 0.72), (-1.25, 6.05, 1.84), collection, materials["steel"], v1, target, "service_access", bevel=0.055)
    for z in (1.58, 2.10):
        add_target_cylinder(prefix + f"_HATCH_FASTENER_{int(z*100)}", 0.055, 0.10, (-1.25, 6.08, z), collection, materials["amber"], v1, target, "fastener", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.012)
    add_target_cylinder(prefix + "_STATUS_LAMP", 0.095, 0.12, (-1.25, 6.08, 2.25), collection, materials["aqua"], v1, target, "service_control", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.015)
    add_target_cylinder(prefix + "_MAIN_JOURNAL_GREASE_CUP", 0.070, 0.16, (0.72, 6.16, 4.31), collection, materials["grease"], v1, target, "service_hardware", bevel=0.016)
    add_target_box(prefix + "_GUARD_SERVICE_PANEL", (0.52, 0.09, 0.88), (1.28, 6.07, 2.82), collection, materials["cast"], v1, target, "service_access", bevel=0.065)
    for z in (2.52, 3.10):
        add_target_cylinder(prefix + f"_SERVICE_PANEL_LATCH_{int(z*100)}", 0.052, 0.10, (1.28, 6.08, z), collection, materials["amber"], v1, target, "fastener", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.012)

    roll = add_target_cylinder(prefix + "_PAPER_ROLL", 0.43, 2.20, (0.0, 8.10, 5.30), paper_collection, materials["paper"], v1, target, "paper_roll", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.035)
    tag(roll, "paper_roll", target=target, support_count=4)
    add_target_cylinder(prefix + "_ROLL_CORE", 0.14, 2.42, (0.0, 8.10, 5.30), paper_collection, materials["grease"], v1, target, "paper_roll_core", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.025, support_target=roll.name)
    for x in (-1.29, 1.29):
        add_target_beam(prefix + f"_ROLL_ARM_{'L' if x < 0 else 'R'}", (x, 8.10, 5.30), (x * 0.98, 8.45, 4.30), 0.09, collection, materials["cast"], v1, target, "paper_support", support_target=roll.name)
        add_target_cylinder(prefix + f"_ROLL_BEARING_{'L' if x < 0 else 'R'}", 0.19, 0.16, (x, 8.10, 5.30), collection, materials["amber"], v1, target, "paper_support", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.025, support_target=roll.name)
    guide_specs = [
        ("HIGH", -0.42, 7.74, 4.52, 0.16, 1.54, materials["steel"]),
        ("ENTRY", -0.42, 7.04, 1.76, 0.13, 1.48, materials["grease"]),
    ]
    for token, center_x, y, z, radius, depth, roller_material in guide_specs:
        add_target_cylinder(prefix + f"_GUIDE_ROLLER_{token}", radius, depth, (center_x, y, z), collection, roller_material, v1, target, "paper_support", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.025)
        for side, x in (("L", center_x - depth * 0.5 - 0.08), ("R", center_x + depth * 0.5 + 0.08)):
            add_target_cylinder(prefix + f"_{token}_ROLLER_JOURNAL_{side}", radius * 0.70, 0.15, (x, y, z), collection, materials["amber"], v1, target, "bearing_housing", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022)
            frame_x = -1.28 if side == "L" else 1.28
            add_target_beam(prefix + f"_{token}_ROLLER_BRACKET_{side}", (x, y, z), (frame_x, y + 0.34, z + (0.34 if token == "HIGH" else -0.34)), 0.075, collection, materials["cast"], v1, target, "paper_support")
    feed = add_paper_web(prefix + "_FEED_WEB", [(8.10, 5.02, 0.00), (7.76, 4.64, 0.025), (7.43, 3.52, -0.030), (7.06, 1.89, 0.018), (7.38, 1.67, 0.00)], 1.15, paper_collection, materials["paper"], v1, target, 3, x_center=-0.42)
    for y, z in ((8.10, 5.30), (7.74, 4.52), (7.04, 1.76)):
        add_target_beam(prefix + f"_WEB_SUPPORT_{int(abs(y)*100)}_{int(z*100)}", (-1.02, y, z), (0.18, y, z), 0.035, collection, materials["steel"], v1, target, "paper_support", support_target=feed.name)
    output = add_paper_web(prefix + "_OUTPUT_WEB", [(7.48, 1.67, 0.00), (6.94, 1.68, 0.03), (6.52, 1.48, -0.045), (6.18, 1.62, 0.02)], 1.12, paper_collection, materials["paper"], v1, target, 2, x_center=-0.42)
    for x in (-0.92, 0.08):
        add_target_beam(prefix + f"_OUTPUT_TRAY_{'L' if x < 0 else 'R'}", (x, 7.26, 1.58), (x, 6.16, 1.34), 0.045, collection, materials["steel"], v1, target, "paper_support", support_target=output.name)


def build_south_roller_press(collection, paper_collection, materials, v1) -> None:
    target = REACTOR_TARGETS["south"]
    prefix = "V3_SOUTH_ROLLER_PRESS"
    add_anchor_set(prefix, (-6.34, -8.62), collection, materials, v1, target)
    add_frame_pair(prefix, -6.24, -8.50, collection, materials, v1, target, center_z=3.12)
    for token, z, radius, material in (("LOW", 2.32, 0.34, materials["grease"]), ("HIGH", 3.18, 0.31, materials["steel"])):
        add_target_cylinder(prefix + f"_{token}_ROLLER", radius, 2.36, (0.0, -7.36, z), collection, material, v1, target, "press_roller", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.035)
        for x in (-1.28, 1.28):
            add_target_cylinder(prefix + f"_{token}_BEARING_{'L' if x < 0 else 'R'}", radius * 0.55, 0.16, (x, -7.36, z), collection, materials["amber"], v1, target, "paper_support", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.025)
    add_gear(prefix + "_DRIVE_GEAR", (0.66, -6.10, 3.20), 0.58, 0.18, 16, collection, materials["cast"], materials["steel"], v1, target)
    add_gear(prefix + "_SYNC_GEAR", (-0.64, -6.10, 2.38), 0.47, 0.17, 14, collection, materials["steel"], materials["amber"], v1, target)
    add_target_beam(prefix + "_TENSION_ARM", (0.66, -6.13, 3.20), (1.28, -6.13, 4.18), 0.085, collection, materials["grease"], v1, target, "gear_linkage")
    add_target_cylinder(prefix + "_TENSIONER", 0.19, 0.16, (1.28, -6.13, 4.18), collection, materials["safety"], v1, target, "gear_linkage", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.025)
    add_target_cylinder(prefix + "_DRIVE_MOTOR", 0.36, 0.62, (1.32, -8.08, 1.16), collection, materials["cast"], v1, target, "drive_motor", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.075)
    for offset in (-0.20, 0.0, 0.20):
        add_target_box(prefix + f"_MOTOR_FIN_{int((offset+0.3)*100)}", (0.10, 0.62, 0.82), (1.32 + offset, -8.08, 1.16), collection, materials["steel"], v1, target, "drive_motor", bevel=0.025)

    roll = add_target_cylinder(prefix + "_PAPER_ROLL", 0.40, 2.16, (0.0, -8.12, 4.76), paper_collection, materials["paper"], v1, target, "paper_roll", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.035)
    tag(roll, "paper_roll", target=target, support_count=4)
    add_target_cylinder(prefix + "_ROLL_CORE", 0.13, 2.40, (0.0, -8.12, 4.76), paper_collection, materials["grease"], v1, target, "paper_roll_core", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022, support_target=roll.name)
    for x in (-1.27, 1.27):
        add_target_beam(prefix + f"_ROLL_ARM_{'L' if x < 0 else 'R'}", (x, -8.12, 4.76), (x * 0.98, -8.44, 3.90), 0.085, collection, materials["cast"], v1, target, "paper_support", support_target=roll.name)
        add_target_cylinder(prefix + f"_ROLL_BEARING_{'L' if x < 0 else 'R'}", 0.18, 0.16, (x, -8.12, 4.76), collection, materials["amber"], v1, target, "paper_support", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022, support_target=roll.name)
    feed = add_paper_web(prefix + "_FEED_WEB", [(-8.12, 4.48, 0.00), (-7.82, 4.10, -0.02), (-7.45, 3.62, 0.03), (-7.28, 3.36, 0.00)], 1.82, paper_collection, materials["paper"], v1, target, 2)
    for y, z in ((-8.12, 4.76), (-7.30, 3.35)):
        add_target_beam(prefix + f"_WEB_SUPPORT_{int(abs(y)*100)}", (-1.02, y, z), (1.02, y, z), 0.035, collection, materials["steel"], v1, target, "paper_support", support_target=feed.name)
    output = add_paper_web(prefix + "_OUTPUT_WEB", [(-7.12, 2.55, 0.00), (-6.76, 2.38, 0.035), (-6.38, 2.16, -0.04), (-6.12, 2.32, 0.02)], 1.72, paper_collection, materials["paper"], v1, target, 2)
    for x in (-0.82, 0.82):
        add_target_beam(prefix + f"_OUTPUT_TRAY_{'L' if x < 0 else 'R'}", (x, -7.18, 2.16), (x, -6.10, 1.95), 0.045, collection, materials["steel"], v1, target, "paper_support", support_target=output.name)
    add_target_box(prefix + "_SERVICE_DOOR", (0.55, 0.08, 0.78), (-1.22, -6.04, 1.35), collection, materials["steel"], v1, target, "service_access", bevel=0.065)
    add_target_cylinder(prefix + "_E_STOP", 0.10, 0.12, (-1.22, -6.08, 1.65), collection, materials["safety"], v1, target, "service_control", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.018)


def add_area_light(name, location, target, energy, color, size, collection):
    data = bpy.data.lights.new(name + "__DATA", "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size * 0.55
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    obj["kyx_scope"] = SCOPE
    return obj


def configure_lighting(collection):
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("V3_CHECKPOINT_WORLD")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.009, 0.012, 1.0)
    background.inputs["Strength"].default_value = 0.18
    add_area_light("V3_NORTH_KEY", (-5.5, 2.5, 7.6), (0.0, 7.3, 2.8), 1250.0, (1.0, 0.45, 0.18), 4.2, collection)
    add_area_light("V3_NORTH_RIM", (5.0, 6.0, 6.8), (0.0, 7.4, 3.0), 930.0, (0.18, 0.70, 0.78), 3.4, collection)
    add_area_light("V3_FORCE_PATH_FILL", (-2.2, 5.6, 4.2), (0.0, 7.35, 3.15), 820.0, (0.62, 0.78, 0.80), 2.8, collection)
    add_area_light("V3_PAPER_WEB_FILL", (-1.5, 7.8, 5.7), (-0.42, 7.4, 3.0), 540.0, (1.0, 0.72, 0.40), 2.2, collection)
    add_area_light("V3_SOUTH_KEY", (-4.0, -2.5, 6.8), (0.0, -7.3, 2.7), 1080.0, (0.95, 0.34, 0.12), 4.0, collection)
    add_area_light("V3_CONTEXT_FILL", (0.0, 0.0, 8.4), (0.0, 0.0, 1.0), 760.0, (0.30, 0.57, 0.65), 7.0, collection)


def create_camera(name, location, target, lens, collection):
    data = bpy.data.cameras.new(name + "__DATA")
    data.lens = lens
    data.sensor_width = 36.0
    data.clip_start = 0.05
    data.clip_end = 200.0
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "checkpoint_review_camera"
    return obj


def configure_cameras(collection):
    return {
        "gameplay_eye": create_camera("CAM_V3_1_GAMEPLAY_EYE", (-18.2, -1.5, 1.72), (0.0, 0.0, 2.55), 31.0, collection),
        "hero_close": create_camera("CAM_V3_1_HERO_CLOSE", (-5.9, 2.8, 3.25), (0.0, 7.34, 3.10), 43.0, collection),
        "overhead_context": create_camera("CAM_V3_1_OVERHEAD_CONTEXT", (-14.0, -6.5, 6.35), (0.0, -0.3, 2.20), 35.0, collection),
    }


def render_views(output_root: Path, cameras: dict[str, bpy.types.Object]) -> list[dict[str, Any]]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    results = []
    for view_id, camera in cameras.items():
        output_path = output_root / f"checkpoint-v3-1/renders/inkfall-press-hall-v3-1-{view_id}.png"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        scene.camera = camera
        scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "path": output_path})
    return results


def make_image_material(name: str, image_path: Path) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(image_path), check_existing=False)
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def create_checkpoint_board(output_path: Path, image_paths: list[Path], main_scene: bpy.types.Scene) -> None:
    # Compose exact pixels instead of photographing image planes.  The layout is
    # two full 960x540 views on top with the context view centered below.
    from array import array

    if len(image_paths) != 3:
        raise RuntimeError("The v3 checkpoint board requires exactly three views")
    width, height = 1920, 1080
    panel_width, panel_height = 960, 540
    canvas = array("f", [0.003, 0.004, 0.006, 1.0]) * (width * height)
    placements = [(0, 540), (960, 540), (480, 0)]
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
    board = bpy.data.images.new("G5_V3_HERO_CHECKPOINT_BOARD", width=width, height=height, alpha=True)
    board.pixels.foreach_set(canvas)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.filepath_raw = str(output_path)
    board.file_format = "PNG"
    board.save()


def png_dimensions(path: Path) -> list[int]:
    import struct
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"Invalid PNG: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise RuntimeError(f"Missing IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def artifact(path: Path, repo_root: Path, *, include_resolution=False) -> dict[str, Any]:
    entry = {"path": path.relative_to(repo_root).as_posix(), "sha256": sha256_file(path), "bytes": path.stat().st_size}
    if include_resolution:
        entry["resolution"] = png_dimensions(path)
    return entry


def detail_counts() -> dict[str, int]:
    counts = {}
    for obj in bpy.data.objects:
        family = obj.get("kyx_v3_family")
        if family:
            counts[str(family)] = counts.get(str(family), 0) + 1
    return dict(sorted(counts.items()))


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    v1 = import_v1_builder(repo_root)
    p67_before = v1.verify_inputs(repo_root)
    v1_before = verify_hash_set(repo_root, PRESERVED_V1)
    v2_before = verify_hash_set(repo_root, PRESERVED_REJECTED_V2)
    v3_before = verify_hash_set(repo_root, PRESERVED_V3_CHECKPOINT)
    bpy.ops.wm.open_mainfile(filepath=str(repo_root / V1_BLEND[0]), load_ui=False)
    removed = remove_inherited_reactors_and_floaters()
    materials = make_materials()
    replace_context_materials(materials)
    machine_collection = make_collection("G5_V3_1_HERO_PRESS_MACHINERY")
    paper_collection = make_collection("G5_V3_1_SUPPORTED_PAPER_SYSTEMS")
    light_collection = make_collection("G5_V3_1_CHECKPOINT_LIGHTING")
    camera_collection = make_collection("G5_V3_1_CHECKPOINT_CAMERAS")
    build_north_forging_press(machine_collection, paper_collection, materials, v1)
    build_south_roller_press(machine_collection, paper_collection, materials, v1)
    configure_lighting(light_collection)
    cameras = configure_cameras(camera_collection)
    scene = bpy.context.scene
    scene["kyx_scope"] = SCOPE
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_map_id"] = "inkfall_foundry"
    scene["kyx_graybox_revision"] = 2
    scene["kyx_graybox_lock_revision"] = 1
    scene["kyx_catalog_default_revision"] = 1
    scene["kyx_authority_collision_included"] = False
    scene["kyx_product_selectable"] = False
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_checkpoint_only"] = True
    scene["kyx_checkpoint_revision"] = "3.1"
    scene["kyx_parent_art_candidate"] = "inkfall_foundry_press_hall_final_art_v1"
    scene["kyx_rejected_v2_imported"] = False

    source_path = output_root / "checkpoint-v3-1/source/inkfall_foundry_press_hall_hero_checkpoint_v3_1.blend"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    render_results = render_views(output_root, cameras)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    board_path = output_root / "checkpoint-v3-1/boards/inkfall-press-hall-v3-1-hero-checkpoint-board.png"
    create_checkpoint_board(board_path, [item["path"] for item in render_results], scene)

    envelope_results = v1.validate_replacement_envelopes()
    constants_path = repo_root / "src/content/maps/constants.ts"
    constants_text = constants_path.read_text(encoding="utf-8")
    unsupported_remaining = sorted(obj.name for obj in bpy.data.objects if obj.name.startswith(UNSUPPORTED_PAPER_PREFIXES))
    collision_objects = sorted(obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None})
    counts = detail_counts()
    paper_rolls = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "paper_roll"]
    paper_webs = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "supported_paper_web"]
    supports = {
        obj.name: sum(1 for candidate in bpy.data.objects if candidate.get("kyx_support_target") == obj.name)
        for obj in [*paper_rolls, *paper_webs]
    }
    p67_after = v1.verify_inputs(repo_root)
    v1_after = verify_hash_set(repo_root, PRESERVED_V1)
    v2_after = verify_hash_set(repo_root, PRESERVED_REJECTED_V2)
    v3_after = verify_hash_set(repo_root, PRESERVED_V3_CHECKPOINT)
    render_artifacts = [artifact(item["path"], repo_root, include_resolution=True) | {"view": item["view"]} for item in render_results]
    board_artifact = artifact(board_path, repo_root, include_resolution=True)
    checks = {
        "p67InputsUnchanged": p67_before == p67_after,
        "verifiedV1Unchanged": v1_before == v1_after,
        "rejectedV2Unchanged": v2_before == v2_after,
        "baselineV3CheckpointUnchanged": v3_before == v3_after,
        "catalogDefaultStillRevision1": "DEFAULT_MAP_REVISION = 1 as const" in constants_text,
        "authorityCollisionObjectsAbsent": collision_objects == [],
        "allReplacementEnvelopesContained": all(item["status"] == "PASS" for item in envelope_results),
        "unsupportedPaperRemoved": unsupported_remaining == [],
        "twoFunctionalHeroPresses": counts.get("cast_frame", 0) >= 20 and counts.get("gear_linkage", 0) >= 50 and counts.get("press_roller", 0) >= 2,
        "massiveConnectedFrameAndAnchors": counts.get("anchored_base", 0) >= 12 and counts.get("frame_tie", 0) >= 12 and counts.get("fastener", 0) >= 24,
        "literalPoweredNorthForcePath": counts.get("powered_force_path", 0) >= 10 and counts.get("crosshead_guide", 0) >= 4 and counts.get("bearing_housing", 0) >= 5,
        "paperRollsPhysicallySupported": len(paper_rolls) == 2 and all(int(obj.get("kyx_support_count", 0)) >= 4 and supports[obj.name] >= 3 for obj in paper_rolls),
        "paperWebsPhysicallySupported": len(paper_webs) == 4 and all(int(obj.get("kyx_support_count", 0)) >= 2 and supports[obj.name] >= 2 for obj in paper_webs),
        "threeCheckpointViewsRendered": len(render_artifacts) == 3 and all(item["resolution"] == [1600, 900] for item in render_artifacts),
        "checkpointBoardRendered": board_artifact["resolution"] == [1920, 1080],
    }
    status = "PRESS_HALL_V3_1_HERO_CHECKPOINT_BUILD_PASS" if all(checks.values()) else "PRESS_HALL_V3_1_HERO_CHECKPOINT_BUILD_FAIL"
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_v3_1_hero_checkpoint_delta",
        "status": status,
        "scope": SCOPE,
        "checks": checks,
        "removedInheritedObjects": removed,
        "detailCounts": counts,
        "paperSupportCounts": supports,
        "replacementEnvelopeValidation": envelope_results,
        "collisionObjects": collision_objects,
        "unsupportedPaperRemaining": unsupported_remaining,
        "preservedP67Before": p67_before,
        "preservedP67After": p67_after,
        "preservedV1Before": v1_before,
        "preservedV1After": v1_after,
        "preservedRejectedV2Before": v2_before,
        "preservedRejectedV2After": v2_after,
        "preservedBaselineV3Before": v3_before,
        "preservedBaselineV3After": v3_after,
        "deltaFromV3": [
            "replaced stretched generated-coordinate breakup with object-coordinate cast-metal pitting",
            "enlarged and connected cast arches, posts, gussets, base rails, shoes, ties, and anchor bolts",
            "made the north force path literal from rear motor and journaled shaft through flywheel/eccentric to crosshead, ram, platen, and die",
            "added bearing housings, bolt circle, grease cup, service guard/panel hardware, and roller journals/brackets",
            "routed the paper web visibly over bracketed rollers into and out of the die at a readable lateral offset",
            "removed organic garden-clutter rods and hid only the two inherited inner baffle render shells for checkpoint visibility",
            "raised ambient and local force-path/paper-web fill light",
        ],
        "artifacts": {
            "sourceBlend": artifact(source_path, repo_root),
            "renders": render_artifacts,
            "board": board_artifact,
        },
        "visualDecision": "PENDING_PARENT_V3_1_CHECKPOINT_REVIEW",
        "nonClaims": [
            "G5_NOT_PASSED", "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED", "PERFORMANCE_NOT_MEASURED",
            "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE", "PRODUCT_INTEGRATION_NOT_COMPLETE",
            "REVISION_2_NOT_DEFAULT_OR_SHIPPING", "FULL_EVIDENCE_PACK_NOT_STARTED", "DEPLOYMENT_NOT_AUTHORIZED",
        ],
    }
    report_path = output_root / "checkpoint-v3-1/validation/press-hall-v3-1-hero-checkpoint-delta-report.json"
    stable_json(report_path, report)
    print("G5_PRESS_HALL_V3_1_CHECKPOINT=" + json.dumps({"status": status, "report": str(report_path), "board": str(board_path)}, sort_keys=True))
    if not all(checks.values()):
        raise RuntimeError(f"V3.1 checkpoint build failed: {[key for key, value in checks.items() if not value]}")


if __name__ == "__main__":
    main()
