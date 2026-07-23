"""Build the preserved Inkfall Foundry Press Hall final-art candidate v2.

V2 opens the verified v1 .blend, preserves v1 and all P6.7 inputs by exact
hash, replaces unsupported overhead slabs, adds authored foundry machinery and
material history, strengthens Paper Drop, and saves to a new render-only path.
It never edits authority collision, runtime catalog state, or the v1 package.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector


GENERATOR_ID = "inkfall_foundry_press_hall_final_art_v2"
GENERATOR_VERSION = 2
SCOPE = "G5_BOUNDED_PRESS_HALL_ART_V2_PREVIEW_ONLY"

EXPECTED_V1 = {
    "blend": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/source/inkfall_foundry_press_hall_final_art_v1.blend",
        "e1d186c630bd87ee6c68b58427ba095086bae57bcf4daa147afbd859d7f92495",
    ),
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

REQUIRED_DETAIL_THRESHOLDS = {
    "supported_print_stock": 4,
    "support_and_clamp": 24,
    "fastener": 32,
    "conduit_and_cable": 20,
    "foundry_machinery": 24,
    "surface_history": 18,
    "safety_signage": 8,
    "paper_drop_identity": 18,
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


def stable_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def import_v1_builder(repo_root: Path):
    source = repo_root / "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/build_press_hall_final_art_v1.py"
    spec = importlib.util.spec_from_file_location("kyx_press_hall_v1_builder", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import v1 builder: {source}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def verify_v1(repo_root: Path) -> dict[str, dict[str, str]]:
    results = {}
    for role, (relative, expected) in EXPECTED_V1.items():
        path = repo_root / relative
        actual = sha256_file(path)
        results[role] = {"path": relative, "expectedSha256": expected, "actualSha256": actual}
        if actual != expected:
            raise RuntimeError(f"Verified v1 drifted for {role}: {actual} != {expected}")
    return results


def make_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def tag_detail(
    obj: bpy.types.Object,
    family: str,
    *,
    transition_id: str | None = None,
    support_target: str | None = None,
) -> bpy.types.Object:
    obj["kyx_scope"] = SCOPE
    obj["kyx_collision"] = False
    obj["kyx_v2_detail_family"] = family
    if transition_id:
        obj["kyx_transition_id"] = transition_id
    if support_target:
        obj["kyx_support_target"] = support_target
    return obj


def make_weathered_material(
    name: str,
    semantic_slot: str,
    dark_color: tuple[float, float, float, float],
    light_color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness_min: float,
    roughness_max: float,
    noise_scale: float,
    bump_strength: float,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = light_color
    material["kyx_material_slot"] = semantic_slot
    material["kyx_original_material"] = True
    material["kyx_v2_weathered"] = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (620, 20)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (300, 20)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = (roughness_min + roughness_max) * 0.5
    if "Emission Color" in principled.inputs:
        principled.inputs["Emission Color"].default_value = light_color
    if "Emission Strength" in principled.inputs:
        principled.inputs["Emission Strength"].default_value = emission_strength
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    coordinate = nodes.new("ShaderNodeTexCoord")
    coordinate.location = (-920, 40)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-700, 80)
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    noise.inputs["Distortion"].default_value = 0.12
    links.new(coordinate.outputs["Generated"], noise.inputs["Vector"])

    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.location = (-440, 110)
    color_ramp.color_ramp.elements[0].position = 0.27
    color_ramp.color_ramp.elements[0].color = dark_color
    color_ramp.color_ramp.elements[1].position = 0.76
    color_ramp.color_ramp.elements[1].color = light_color
    links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])

    rough_map = nodes.new("ShaderNodeMapRange")
    rough_map.location = (-130, -20)
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 1.0
    rough_map.inputs["To Min"].default_value = roughness_min
    rough_map.inputs["To Max"].default_value = roughness_max
    links.new(noise.outputs["Fac"], rough_map.inputs["Value"])
    links.new(rough_map.outputs["Result"], principled.inputs["Roughness"])

    detail_noise = nodes.new("ShaderNodeTexNoise")
    detail_noise.location = (-700, -220)
    detail_noise.inputs["Scale"].default_value = noise_scale * 7.0
    detail_noise.inputs["Detail"].default_value = 2.5
    links.new(coordinate.outputs["Generated"], detail_noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.location = (20, -180)
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.065
    links.new(detail_noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def make_v2_materials() -> dict[str, bpy.types.Material]:
    return {
        "aged_ceramic": make_weathered_material(
            "KYX_V2_AGED_PAPER_CERAMIC",
            "env_base_ceramic",
            (0.46, 0.42, 0.34, 1.0),
            (0.82, 0.76, 0.63, 1.0),
            metallic=0.03,
            roughness_min=0.54,
            roughness_max=0.86,
            noise_scale=3.8,
            bump_strength=0.18,
        ),
        "paper_stock": make_weathered_material(
            "KYX_V2_FIBROUS_PRINT_STOCK",
            "env_base_ceramic",
            (0.30, 0.24, 0.16, 1.0),
            (0.68, 0.55, 0.36, 1.0),
            metallic=0.0,
            roughness_min=0.67,
            roughness_max=0.94,
            noise_scale=6.5,
            bump_strength=0.25,
        ),
        "paper_drop_stock": make_weathered_material(
            "KYX_V2_PAPER_DROP_OILED_STOCK",
            "env_base_ceramic",
            (0.15, 0.095, 0.045, 1.0),
            (0.52, 0.31, 0.12, 1.0),
            metallic=0.02,
            roughness_min=0.61,
            roughness_max=0.91,
            noise_scale=8.4,
            bump_strength=0.31,
        ),
        "oxidized_graphite": make_weathered_material(
            "KYX_V2_OXIDIZED_GRAPHITE",
            "env_secondary_metal",
            (0.018, 0.025, 0.032, 1.0),
            (0.16, 0.15, 0.13, 1.0),
            metallic=0.72,
            roughness_min=0.30,
            roughness_max=0.71,
            noise_scale=5.2,
            bump_strength=0.12,
        ),
        "ink_grime": make_weathered_material(
            "KYX_V2_INK_GRIME",
            "env_ink_surface",
            (0.003, 0.006, 0.010, 1.0),
            (0.055, 0.048, 0.038, 1.0),
            metallic=0.12,
            roughness_min=0.38,
            roughness_max=0.88,
            noise_scale=2.2,
            bump_strength=0.20,
        ),
        "worn_vermilion": make_weathered_material(
            "KYX_V2_WORN_VERMILION",
            "env_vermilion_safety",
            (0.24, 0.026, 0.012, 1.0),
            (0.72, 0.095, 0.035, 1.0),
            metallic=0.26,
            roughness_min=0.34,
            roughness_max=0.73,
            noise_scale=7.0,
            bump_strength=0.12,
        ),
        "worn_amber": make_weathered_material(
            "KYX_V2_REGISTRATION_AMBER",
            "env_functional_marking",
            (0.34, 0.16, 0.018, 1.0),
            (0.95, 0.56, 0.055, 1.0),
            metallic=0.16,
            roughness_min=0.40,
            roughness_max=0.70,
            noise_scale=8.0,
            bump_strength=0.08,
        ),
        "aqua_status": make_weathered_material(
            "KYX_V2_AQUA_STATUS",
            "env_emissive_signage",
            (0.006, 0.20, 0.20, 1.0),
            (0.025, 0.72, 0.66, 1.0),
            metallic=0.0,
            roughness_min=0.28,
            roughness_max=0.48,
            noise_scale=13.0,
            bump_strength=0.03,
            emission_strength=1.9,
        ),
        "garden": make_weathered_material(
            "KYX_V2_GARDEN_CONDUIT",
            "env_garden_fragment",
            (0.035, 0.072, 0.025, 1.0),
            (0.19, 0.31, 0.10, 1.0),
            metallic=0.0,
            roughness_min=0.68,
            roughness_max=0.94,
            noise_scale=4.0,
            bump_strength=0.24,
        ),
        "cable": make_weathered_material(
            "KYX_V2_RUBBERIZED_CABLE",
            "env_secondary_metal",
            (0.006, 0.008, 0.012, 1.0),
            (0.035, 0.044, 0.052, 1.0),
            metallic=0.08,
            roughness_min=0.55,
            roughness_max=0.86,
            noise_scale=12.0,
            bump_strength=0.09,
        ),
        "fastener": make_weathered_material(
            "KYX_V2_FASTENER_STEEL",
            "env_secondary_metal",
            (0.055, 0.060, 0.062, 1.0),
            (0.42, 0.38, 0.30, 1.0),
            metallic=0.90,
            roughness_min=0.22,
            roughness_max=0.58,
            noise_scale=10.0,
            bump_strength=0.06,
        ),
    }


def replace_v1_materials(materials: dict[str, bpy.types.Material]) -> None:
    for obj in bpy.data.objects:
        data = getattr(obj, "data", None)
        slots = getattr(data, "materials", None)
        if slots is None:
            continue
        for index, old in enumerate(list(slots)):
            if old is None:
                continue
            slot = old.get("kyx_material_slot")
            name = old.name.upper()
            replacement = None
            if "PAPER_FIBER" in name:
                replacement = materials["paper_stock"]
            elif slot == "env_base_ceramic":
                replacement = materials["aged_ceramic"]
            elif slot == "env_secondary_metal":
                replacement = materials["oxidized_graphite"]
            elif slot == "env_ink_surface":
                replacement = materials["ink_grime"]
            elif slot == "env_vermilion_safety":
                replacement = materials["worn_vermilion"]
            elif slot == "env_functional_marking":
                replacement = materials["worn_amber"]
            elif slot == "env_emissive_signage":
                replacement = materials["aqua_status"]
            elif slot == "env_garden_fragment":
                replacement = materials["garden"]
            if replacement is not None:
                slots[index] = replacement


def delete_unsupported_v1_sheets() -> list[str]:
    removed = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith("PH_HANGING_PAPER_") or obj.name.startswith("PH_HANGING_PAPER_SPINE_"):
            removed.append(obj.name)
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
    return sorted(removed)


def add_sphere(
    name: str,
    radius: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    family: str,
    transition_id: str | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=radius, location=location)
    obj = bpy.context.active_object
    obj.name = name
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return tag_detail(obj, family, transition_id=transition_id)


def add_folded_sheet(
    name: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    v1,
    *,
    fold: float,
    torn: tuple[float, float, float],
) -> bpy.types.Object:
    cx, cy, top = center
    xs = (-width * 0.5, 0.0, width * 0.5)
    offsets = (-fold, fold, -fold * 0.55)
    vertices = []
    for index, x in enumerate(xs):
        vertices.append((cx + x, cy + offsets[index], top))
    for index, x in enumerate(xs):
        vertices.append((cx + x, cy + offsets[index], top - height + torn[index]))
    faces = [(0, 1, 4, 3), (1, 2, 5, 4)]
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    tag_detail(obj, "supported_print_stock")
    solidify = obj.modifiers.new("KYX_PRINT_STOCK_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.055
    solidify.offset = 0.0
    bevel = obj.modifiers.new("KYX_PRINT_STOCK_EDGE", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


def build_supported_print_stock(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    stock = collections["stock"]
    supports = collections["supports"]
    placements = [
        ("A", -13.0, 3.0, 4.35, 2.10, 0.12, (0.10, -0.12, 0.02)),
        ("B", -6.5, 1.5, 4.85, 2.45, 0.16, (0.02, -0.18, 0.12)),
        ("C", 5.8, 2.7, 4.45, 2.25, 0.14, (-0.08, 0.06, -0.16)),
        ("D", 13.2, -1.5, 3.95, 1.95, 0.11, (-0.15, 0.04, -0.08)),
    ]
    for index, (token, x, y, width, height, fold, torn) in enumerate(placements):
        top = 7.78 - (index % 2) * 0.10
        roller = v1.add_cylinder(
            f"V2_PRINT_ROLLER_{token}",
            0.16,
            width + 0.44,
            (x, y, top + 0.12),
            supports,
            materials["fastener"],
            vertices=32,
            rotation=(0.0, math.pi / 2.0, 0.0),
            bevel=0.035,
            role="overhead_render_only",
        )
        tag_detail(roller, "support_and_clamp", support_target=f"V2_PRINT_STOCK_{token}")
        for side, sx in enumerate((x - width * 0.5 - 0.16, x + width * 0.5 + 0.16)):
            housing = v1.add_box(
                f"V2_PRINT_ROLLER_HOUSING_{token}_{side}",
                (0.28, 0.42, 0.42),
                (sx, y, top + 0.12),
                supports,
                materials["oxidized_graphite"],
                bevel=0.055,
                role="overhead_render_only",
            )
            tag_detail(housing, "support_and_clamp", support_target=f"V2_PRINT_STOCK_{token}")
            cable = v1.add_beam_between(
                f"V2_PRINT_SUPPORT_CABLE_{token}_{side}",
                (sx, y, top + 0.30),
                (sx + (-0.10 if side == 0 else 0.10), y, 8.48),
                0.040,
                supports,
                materials["cable"],
                vertices=12,
                role="overhead_render_only",
            )
            tag_detail(cable, "support_and_clamp", support_target=f"V2_PRINT_STOCK_{token}")
        sheet = add_folded_sheet(
            f"V2_PRINT_STOCK_{token}",
            (x, y, top),
            width,
            height,
            stock,
            materials["paper_stock"],
            v1,
            fold=fold,
            torn=torn,
        )
        sheet["kyx_support_count"] = 5
        registration = v1.add_box(
            f"V2_PRINT_REGISTRATION_EDGE_{token}",
            (0.11, 0.075, height * 0.66),
            (x + width * 0.38, y - fold * 0.25, top - height * 0.47),
            stock,
            materials["worn_vermilion"],
            bevel=0.018,
            role="overhead_render_only",
        )
        tag_detail(registration, "safety_signage", support_target=f"V2_PRINT_STOCK_{token}")


def build_fasteners(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    faces = [
        obj
        for obj in bpy.data.objects
        if "WALL" in obj.name and "CERAMIC_FACE" in obj.name and obj.type == "MESH"
    ]
    fastener_index = 0
    for face in sorted(faces, key=lambda item: item.name):
        dimensions = face.dimensions
        if dimensions.y < 0.20:
            inward = -1.0 if face.location.y > 0.0 else 1.0
            for x_sign, z_sign in ((-1.0, -1.0), (1.0, 1.0)):
                location = (
                    face.location.x + x_sign * max(0.10, dimensions.x * 0.5 - 0.20),
                    face.location.y + inward * 0.075,
                    face.location.z + z_sign * max(0.10, dimensions.z * 0.5 - 0.24),
                )
                bolt = v1.add_cylinder(
                    f"V2_WALL_FASTENER_{fastener_index:03d}",
                    0.048,
                    0.055,
                    location,
                    collection,
                    materials["fastener"],
                    vertices=12,
                    rotation=(math.pi / 2.0, 0.0, 0.0),
                    bevel=0.009,
                    role="render_detail",
                )
                tag_detail(bolt, "fastener")
                fastener_index += 1
        elif dimensions.x < 0.20:
            inward = -1.0 if face.location.x > 0.0 else 1.0
            for y_sign, z_sign in ((-1.0, -1.0), (1.0, 1.0)):
                location = (
                    face.location.x + inward * 0.075,
                    face.location.y + y_sign * max(0.10, dimensions.y * 0.5 - 0.20),
                    face.location.z + z_sign * max(0.10, dimensions.z * 0.5 - 0.24),
                )
                bolt = v1.add_cylinder(
                    f"V2_WALL_FASTENER_{fastener_index:03d}",
                    0.048,
                    0.055,
                    location,
                    collection,
                    materials["fastener"],
                    vertices=12,
                    rotation=(0.0, math.pi / 2.0, 0.0),
                    bevel=0.009,
                    role="render_detail",
                )
                tag_detail(bolt, "fastener")
                fastener_index += 1


def add_pipe_route(
    stem: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    v1,
    *,
    transition_id: str | None = None,
) -> None:
    for index, (start, end) in enumerate(zip(points, points[1:])):
        pipe = v1.add_beam_between(
            f"{stem}_SEG_{index:02d}",
            start,
            end,
            radius,
            collection,
            material,
            vertices=16,
            role="render_detail",
            transition_id=transition_id,
        )
        tag_detail(pipe, "conduit_and_cable", transition_id=transition_id)
    for index, point in enumerate(points[1:-1]):
        elbow = add_sphere(
            f"{stem}_ELBOW_{index:02d}",
            radius * 1.18,
            point,
            collection,
            material,
            family="conduit_and_cable",
            transition_id=transition_id,
        )
        elbow.scale = (1.0, 1.0, 1.0)


def build_conduit_logic(
    collection: bpy.types.Collection,
    supports: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    routes = [
        ("V2_NORTH_INK_MAIN", [(-20.0, 9.92, 6.55), (-10.0, 9.92, 6.55), (-8.1, 9.92, 5.55), (-8.1, 9.45, 5.15)], 0.075, materials["oxidized_graphite"], None),
        ("V2_NORTH_SIGNAL", [(-19.5, 9.82, 6.22), (-11.0, 9.82, 6.22), (-9.0, 9.82, 5.18)], 0.042, materials["cable"], None),
        ("V2_SOUTH_INK_MAIN", [(19.5, -9.92, 6.42), (8.0, -9.92, 6.42), (4.0, -9.92, 5.55), (2.0, -8.82, 5.32)], 0.075, materials["oxidized_graphite"], None),
        ("V2_REACTOR_NORTH_FEED", [(4.4, 9.65, 4.55), (2.9, 9.65, 4.55), (2.9, 8.65, 4.05), (1.35, 8.65, 4.05)], 0.065, materials["cable"], None),
        ("V2_REACTOR_SOUTH_FEED", [(-4.4, -9.65, 4.25), (-2.8, -9.65, 4.25), (-2.8, -8.62, 3.82), (-1.35, -8.62, 3.82)], 0.065, materials["cable"], None),
        ("V2_PAPER_DROP_FEED", [(-8.1, 9.45, 5.15), (-7.2, 9.30, 5.15), (-6.85, 9.30, 5.42)], 0.055, materials["cable"], "paper_drop"),
    ]
    for stem, points, radius, material, transition in routes:
        add_pipe_route(stem, points, radius, collection, material, v1, transition_id=transition)
    clamp_index = 0
    for x, y, z, rotation in [
        (-18.0, 9.90, 6.55, 0.0), (-14.0, 9.90, 6.55, 0.0), (-10.0, 9.90, 6.55, 0.0),
        (17.0, -9.90, 6.42, 0.0), (12.0, -9.90, 6.42, 0.0), (8.0, -9.90, 6.42, 0.0),
        (-8.1, 9.48, 5.45, math.pi / 2), (2.9, 9.62, 4.52, 0.0), (-2.8, -9.62, 4.22, 0.0),
    ]:
        clamp = v1.add_box(
            f"V2_CONDUIT_CLAMP_{clamp_index:02d}",
            (0.28, 0.16, 0.22),
            (x, y, z),
            supports,
            materials["fastener"],
            bevel=0.035,
            rotation_z=rotation,
            role="render_detail",
        )
        tag_detail(clamp, "support_and_clamp")
        clamp_index += 1


def add_flywheel(
    stem: str,
    center: tuple[float, float, float],
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    cx, cy, cz = center
    rim = v1.add_torus(
        f"{stem}_RIM",
        0.84,
        0.12,
        center,
        collection,
        materials["oxidized_graphite"],
        rotation=(math.pi / 2.0, 0.0, 0.0),
        role="render_detail",
    )
    tag_detail(rim, "foundry_machinery")
    hub = v1.add_cylinder(
        f"{stem}_HUB",
        0.22,
        0.32,
        center,
        collection,
        materials["fastener"],
        vertices=24,
        rotation=(math.pi / 2.0, 0.0, 0.0),
        bevel=0.035,
        role="render_detail",
    )
    tag_detail(hub, "foundry_machinery")
    for index, angle in enumerate((0.0, math.pi / 3.0, 2.0 * math.pi / 3.0)):
        direction = Vector((math.cos(angle), 0.0, math.sin(angle)))
        spoke_a = Vector(center) - direction * 0.70
        spoke_b = Vector(center) + direction * 0.70
        spoke = v1.add_beam_between(
            f"{stem}_SPOKE_{index}",
            tuple(spoke_a),
            tuple(spoke_b),
            0.055,
            collection,
            materials["fastener"],
            vertices=12,
            role="render_detail",
        )
        tag_detail(spoke, "foundry_machinery")


def build_foundry_machinery(
    collection: bpy.types.Collection,
    supports: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    for token, y, red_side in (("NORTH", 7.5, 1.0), ("SOUTH", -7.5, -1.0)):
        crosshead = v1.add_box(
            f"V2_PRESS_CROSSHEAD_{token}",
            (5.75, 0.58, 0.52),
            (0.0, y, 6.38),
            collection,
            materials["oxidized_graphite"],
            bevel=0.10,
            role="overhead_render_only",
        )
        tag_detail(crosshead, "foundry_machinery")
        for index, x in enumerate((-2.34, -1.12, 1.12, 2.34)):
            rod = v1.add_cylinder(
                f"V2_PRESS_TIE_ROD_{token}_{index}",
                0.085,
                0.72 if abs(x) < 2.0 else 0.52,
                (x, y, 5.96 + (0.10 if abs(x) < 2.0 else 0.20)),
                collection,
                materials["fastener"],
                vertices=18,
                bevel=0.018,
                role="overhead_render_only",
            )
            tag_detail(rod, "foundry_machinery")
            visible_y = y + (-0.34 if y > 0.0 else 0.34)
            collar = v1.add_cylinder(
                f"V2_PRESS_CROSSHEAD_COLLAR_{token}_{index}",
                0.15,
                0.12,
                (x, visible_y, 6.38),
                collection,
                materials["worn_amber" if index in (1, 2) else "fastener"],
                vertices=24,
                rotation=(math.pi / 2.0, 0.0, 0.0),
                bevel=0.025,
                role="overhead_render_only",
            )
            tag_detail(collar, "foundry_machinery")
        for brace_index, x in enumerate((-2.72, 2.72)):
            brace = v1.add_beam_between(
                f"V2_PRESS_DIAGONAL_BRACE_{token}_{brace_index}",
                (x, y, 6.30),
                (x + (-0.58 if x < 0.0 else 0.58), y, 5.18),
                0.11,
                supports,
                materials["oxidized_graphite"],
                vertices=16,
                role="overhead_render_only",
            )
            tag_detail(brace, "foundry_machinery")
        motor = v1.add_box(
            f"V2_PRESS_DRIVE_MOTOR_{token}",
            (1.42, 0.92, 1.18),
            (3.45 * red_side, y + (1.62 if y > 0 else -1.62), 4.25),
            collection,
            materials["oxidized_graphite"],
            bevel=0.17,
            role="wall_integrated_render_only",
        )
        tag_detail(motor, "foundry_machinery")
        for fin in (-0.38, -0.12, 0.12, 0.38):
            cooling = v1.add_box(
                f"V2_MOTOR_FIN_{token}_{int((fin + 0.5) * 100):03d}",
                (0.82, 0.08, 0.72),
                (3.45 * red_side, y + (1.10 if y > 0 else -1.10), 4.25 + fin),
                collection,
                materials["fastener"],
                bevel=0.018,
                role="wall_integrated_render_only",
            )
            tag_detail(cooling, "foundry_machinery")
    add_flywheel("V2_PRESS_FLYWHEEL_NORTH", (2.8, 9.48, 4.92), collection, materials, v1)
    add_flywheel("V2_PRESS_FLYWHEEL_SOUTH", (-2.8, -9.48, 4.60), collection, materials, v1)

    # Paper-stock intake roller and drive housings give Paper Drop a unique machine identity.
    roller = v1.add_cylinder(
        "V2_PAPER_DROP_INTAKE_ROLLER",
        0.25,
        5.25,
        (-4.0, 9.18, 5.36),
        collection,
        materials["fastener"],
        vertices=36,
        rotation=(0.0, math.pi / 2.0, 0.0),
        bevel=0.045,
        role="overhead_render_only",
        transition_id="paper_drop",
    )
    tag_detail(roller, "paper_drop_identity", transition_id="paper_drop")
    for band_index, x in enumerate((-5.55, -4.00, -2.45)):
        band = v1.add_cylinder(
            f"V2_PAPER_DROP_ROLLER_BAND_{band_index}",
            0.278,
            0.16,
            (x, 9.18, 5.36),
            collection,
            materials["worn_amber"],
            vertices=36,
            rotation=(0.0, math.pi / 2.0, 0.0),
            bevel=0.025,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(band, "paper_drop_identity", transition_id="paper_drop")
    for index, x in enumerate((-6.72, -1.28)):
        housing = v1.add_box(
            f"V2_PAPER_DROP_ROLLER_HOUSING_{index}",
            (0.62, 1.12, 0.86),
            (x, 9.20, 5.36),
            collection,
            materials["oxidized_graphite"],
            bevel=0.12,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(housing, "paper_drop_identity", transition_id="paper_drop")
        axle = v1.add_cylinder(
            f"V2_PAPER_DROP_AXLE_CAP_{index}",
            0.19,
            0.12,
            (x + (0.34 if index == 0 else -0.34), 9.20, 5.36),
            collection,
            materials["worn_amber"],
            vertices=24,
            rotation=(0.0, math.pi / 2.0, 0.0),
            bevel=0.025,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(axle, "paper_drop_identity", transition_id="paper_drop")


def build_paper_drop_chute(
    collection: bpy.types.Collection,
    supports: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    # Folded twin-leaf paper chute: all geometry remains above 5.35 m.
    vertices = [
        (-6.55, 9.78, 7.30), (-4.10, 9.56, 6.96), (-4.10, 8.84, 5.62), (-6.35, 8.92, 6.02),
        (-4.10, 9.56, 6.96), (-1.48, 9.78, 7.22), (-1.68, 8.92, 5.94), (-4.10, 8.84, 5.62),
    ]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7)]
    mesh = bpy.data.meshes.new("V2_PAPER_DROP_FOLDED_CHUTE__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    chute = bpy.data.objects.new("V2_PAPER_DROP_FOLDED_CHUTE", mesh)
    collection.objects.link(chute)
    chute.data.materials.append(materials["paper_drop_stock"])
    tag_detail(chute, "paper_drop_identity", transition_id="paper_drop")
    solidify = chute.modifiers.new("KYX_PAPER_CHUTE_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.065
    solidify.offset = 0.0
    bevel = chute.modifiers.new("KYX_PAPER_CHUTE_EDGE", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    bpy.context.view_layer.objects.active = chute
    chute.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    chute.select_set(False)

    rim_segments = [
        ((-6.55, 9.78, 7.30), (-4.10, 9.56, 6.96)),
        ((-4.10, 9.56, 6.96), (-1.48, 9.78, 7.22)),
        ((-6.35, 8.92, 6.02), (-4.10, 8.84, 5.62)),
        ((-4.10, 8.84, 5.62), (-1.68, 8.92, 5.94)),
    ]
    for index, (start, end) in enumerate(rim_segments):
        rim = v1.add_beam_between(
            f"V2_PAPER_DROP_CHUTE_RIM_{index}",
            start,
            end,
            0.055,
            supports,
            materials["oxidized_graphite"],
            vertices=12,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(rim, "paper_drop_identity", transition_id="paper_drop")
    for index, (start, end) in enumerate(
        [
            ((-6.35, 9.72, 7.20), (-6.72, 9.58, 8.45)),
            ((-1.68, 9.72, 7.14), (-1.28, 9.58, 8.45)),
            ((-4.10, 9.56, 6.96), (-4.10, 9.48, 8.45)),
        ]
    ):
        cable = v1.add_beam_between(
            f"V2_PAPER_DROP_CHUTE_SUPPORT_{index}",
            start,
            end,
            0.065,
            supports,
            materials["cable"],
            vertices=12,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(cable, "paper_drop_identity", transition_id="paper_drop", support_target="V2_PAPER_DROP_FOLDED_CHUTE")

    # A dark load-bearing frame makes the folded stock read as a machine chute,
    # not as unsupported white slabs.  All members remain above the frozen route.
    frame_segments = [
        ((-6.72, 9.20, 5.62), (-6.42, 9.66, 7.22)),
        ((-1.28, 9.20, 5.62), (-1.58, 9.66, 7.22)),
        ((-4.10, 9.56, 6.96), (-4.10, 8.84, 5.62)),
        ((-6.30, 9.03, 6.08), (-1.72, 9.03, 6.00)),
    ]
    for index, (start, end) in enumerate(frame_segments):
        frame = v1.add_beam_between(
            f"V2_PAPER_DROP_LOAD_FRAME_{index}",
            start,
            end,
            0.090 if index < 2 else 0.072,
            supports,
            materials["oxidized_graphite"],
            vertices=16,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(frame, "paper_drop_identity", transition_id="paper_drop", support_target="V2_PAPER_DROP_FOLDED_CHUTE")

    crease = v1.add_beam_between(
        "V2_PAPER_DROP_INKED_CREASE",
        (-4.10, 9.55, 6.94),
        (-4.10, 8.82, 5.64),
        0.045,
        collection,
        materials["ink_grime"],
        vertices=12,
        role="overhead_render_only",
        transition_id="paper_drop",
    )
    tag_detail(crease, "paper_drop_identity", transition_id="paper_drop")

    for index, x in enumerate((-6.42, -1.58)):
        clamp = v1.add_box(
            f"V2_PAPER_DROP_CHUTE_CLAMP_{index}",
            (0.34, 0.48, 0.38),
            (x, 9.66, 7.22),
            supports,
            materials["fastener"],
            bevel=0.055,
            role="overhead_render_only",
            transition_id="paper_drop",
        )
        tag_detail(clamp, "paper_drop_identity", transition_id="paper_drop", support_target="V2_PAPER_DROP_FOLDED_CHUTE")

    # Downward registration blades make the drop identity readable without text.
    for index, x in enumerate((-5.35, -4.0, -2.65)):
        profile = [(-0.22, 0.28), (0.22, 0.28), (0.22, -0.05), (0.0, -0.34), (-0.22, -0.05)]
        marker = v1.add_profile_prism_xz(
            f"V2_PAPER_DROP_DOWN_MARK_{index}",
            profile,
            0.045,
            (x, 8.73, 5.05),
            collection,
            materials["worn_amber"],
            bevel=0.018,
            role="render_only_no_authority_collision",
            module_id="sign_panel_2000",
            transition_id="paper_drop",
        )
        tag_detail(marker, "paper_drop_identity", transition_id="paper_drop")
        marker["kyx_shape_cue"] = "downward_fold"


def build_surface_history(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    # Wall-base grime and ink transfer are sparse, functional, and flush.
    history_index = 0
    for y, inward in ((10.115, -1.0), (-10.115, 1.0)):
        for x, width in ((-18.0, 2.6), (-11.5, 1.7), (7.0, 2.2), (15.0, 1.5)):
            strip = v1.add_box(
                f"V2_WALL_BASE_GRIME_{history_index:02d}",
                (width, 0.018, 0.28),
                (x, y + inward * 0.012, 0.16),
                collection,
                materials["ink_grime"],
                bevel=0.012,
                role="flush_surface_history",
            )
            tag_detail(strip, "surface_history")
            history_index += 1
    for index, (x, y, width, length, yaw) in enumerate(
        [
            (-12.0, -2.0, 0.055, 1.15, 0.18), (-8.6, 4.8, 0.045, 0.92, -0.35),
            (4.7, -3.2, 0.052, 1.22, 0.12), (11.8, 3.8, 0.043, 0.84, -0.22),
            (-2.2, 4.2, 0.040, 0.68, 0.43), (16.0, -6.2, 0.038, 0.76, -0.28),
        ]
    ):
        scratch = v1.add_box(
            f"V2_FLOOR_INK_TRANSFER_{index:02d}",
            (length, width, 0.009),
            (x, y, 0.006),
            collection,
            materials["ink_grime"],
            bevel=0.004,
            rotation_z=yaw,
            role="flush_surface_history",
        )
        tag_detail(scratch, "surface_history")
    for index, (x, y, radius) in enumerate(((0.0, 7.5, 1.32), (0.0, -7.5, 1.28), (1.0, -5.0, 1.62))):
        stain = v1.add_torus(
            f"V2_MACHINE_FOOT_INK_STAIN_{index}",
            radius,
            0.065,
            (x, y, 0.016 if index < 2 else 1.022),
            collection,
            materials["ink_grime"],
            role="flush_surface_history",
        )
        tag_detail(stain, "surface_history")
    # Oxide drips sit on the wall plane, never in traversal space.
    for index, (x, y, z, height) in enumerate(
        [(-16.0, 10.115, 2.2, 0.62), (8.0, 10.115, 3.1, 0.46), (-12.0, -10.115, 2.8, 0.55), (16.0, -10.115, 1.9, 0.41)]
    ):
        drip = v1.add_box(
            f"V2_OXIDE_DRIP_{index:02d}",
            (0.045, 0.014, height),
            (x, y, z),
            collection,
            materials["worn_vermilion"],
            bevel=0.006,
            role="flush_surface_history",
        )
        tag_detail(drip, "surface_history")


def build_safety_signage(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    v1,
) -> None:
    markers = [
        ("WEST_TIER", -20.8, 0.0, 0.12, 1.0),
        ("EAST_TIER", 20.8, 0.0, 0.12, -1.0),
        ("NORTH_DROP", -3.0, 5.1, 0.018, 0.0),
        ("RED_FOLD", 1.0, -4.0, 1.025, math.pi),
    ]
    for index, (token, x, y, z, yaw) in enumerate(markers):
        for bar in range(2):
            marker = v1.add_box(
                f"V2_SAFETY_REGISTER_{token}_{bar}",
                (0.72 - bar * 0.18, 0.09, 0.025),
                (x + math.cos(yaw) * bar * 0.22, y + math.sin(yaw) * bar * 0.22, z + bar * 0.004),
                collection,
                materials["worn_amber"] if token != "RED_FOLD" else materials["worn_vermilion"],
                bevel=0.009,
                rotation_z=yaw,
                role="flush_functional_marking",
            )
            tag_detail(marker, "safety_signage", transition_id="red_fold" if token == "RED_FOLD" else None)


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    data = bpy.data.lights.new(f"{name}__DATA", "AREA")
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
    obj["kyx_role"] = "review_lighting"
    return obj


def configure_v2_lighting(collection: bpy.types.Collection) -> None:
    scene = bpy.context.scene
    if scene.world and scene.world.use_nodes:
        background = scene.world.node_tree.nodes.get("Background")
        if background:
            background.inputs["Color"].default_value = (0.012, 0.017, 0.022, 1.0)
            background.inputs["Strength"].default_value = 0.17
    add_area_light("V2_PAPER_DROP_KEY", (-4.0, 5.4, 7.6), (-4.0, 9.2, 5.4), 680.0, (1.0, 0.54, 0.22), 4.8, collection)
    add_area_light("V2_REACTOR_EDGE", (4.8, 2.0, 6.8), (0.0, 7.4, 3.2), 780.0, (0.20, 0.72, 0.78), 3.4, collection)
    add_area_light("V2_RED_FOLD_FOCUS", (7.5, -1.5, 5.8), (1.0, -5.0, 2.8), 720.0, (1.0, 0.23, 0.08), 3.0, collection)


def create_camera(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    data = bpy.data.cameras.new(f"{name}__DATA")
    data.lens = lens
    data.sensor_width = 36.0
    data.dof.use_dof = False
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "deterministic_review_camera"
    return obj


def configure_v2_cameras(collection: bpy.types.Collection) -> dict[str, bpy.types.Object]:
    return {
        "gameplay": create_camera("CAM_V2_GAMEPLAY", (-19.4, -7.8, 1.72), (0.2, 1.8, 3.18), 30.0, collection),
        "close": create_camera("CAM_V2_PRESS_CLOSE", (-11.2, 0.4, 3.85), (-1.3, 8.35, 5.42), 43.0, collection),
        "mid": create_camera("CAM_V2_MID", (17.8, -7.0, 3.45), (-2.2, 2.6, 2.65), 40.0, collection),
        "far": create_camera("CAM_V2_FAR", (-27.0, 0.0, 4.40), (0.2, 0.2, 3.18), 33.0, collection),
        "red_fold": create_camera("CAM_V2_RED_FOLD", (12.2, 2.2, 3.10), (1.0, -5.1, 2.75), 46.0, collection),
        "paper_drop": create_camera("CAM_V2_PAPER_DROP", (-15.8, -1.0, 3.85), (-4.1, 9.15, 5.82), 45.0, collection),
    }


def grayscale_state() -> tuple[list[Any], list[Any], Any]:
    material_state = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                for socket_name in ("Base Color", "Emission Color"):
                    socket = node.inputs.get(socket_name)
                    if socket is None:
                        continue
                    color = tuple(socket.default_value)
                    luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
                    material_state.append((socket, color))
                    socket.default_value = (luminance, luminance, luminance, color[3])
            elif node.type == "VALTORGB":
                for element in node.color_ramp.elements:
                    color = tuple(element.color)
                    luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
                    material_state.append((element, color))
                    element.color = (luminance, luminance, luminance, color[3])
    light_state = []
    for light in bpy.data.lights:
        color = tuple(light.color)
        luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
        light_state.append((light, color))
        light.color = (luminance, luminance, luminance)
    world_state = None
    if bpy.context.scene.world and bpy.context.scene.world.use_nodes:
        background = bpy.context.scene.world.node_tree.nodes.get("Background")
        if background:
            color = tuple(background.inputs["Color"].default_value)
            luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
            world_state = (background.inputs["Color"], color)
            background.inputs["Color"].default_value = (luminance, luminance, luminance, color[3])
    return material_state, light_state, world_state


def restore_grayscale_state(state: tuple[list[Any], list[Any], Any]) -> None:
    material_state, light_state, world_state = state
    for owner, color in material_state:
        if hasattr(owner, "default_value"):
            owner.default_value = color
        else:
            owner.color = color
    for light, color in light_state:
        light.color = color
    if world_state:
        socket, color = world_state
        socket.default_value = color


def render_views(output_root: Path, cameras: dict[str, bpy.types.Object]) -> list[dict[str, Any]]:
    render_dir = output_root / "renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    results = []
    for view_id in ("gameplay", "close", "mid", "far", "red_fold", "paper_drop"):
        path = render_dir / f"inkfall-press-hall-v2-{view_id}-color.png"
        scene.camera = cameras[view_id]
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "mode": "color", "path": path})
    state = grayscale_state()
    gray_path = render_dir / "inkfall-press-hall-v2-gameplay-grayscale.png"
    scene.camera = cameras["gameplay"]
    scene.render.filepath = str(gray_path)
    bpy.ops.render.render(write_still=True)
    restore_grayscale_state(state)
    results.append({"view": "gameplay", "mode": "grayscale", "path": gray_path})
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
    emission.inputs["Strength"].default_value = 1.0
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def create_review_board(
    output_path: Path,
    image_paths: list[Path],
    board_id: str,
    main_scene: bpy.types.Scene,
) -> None:
    if len(image_paths) != 4:
        raise RuntimeError("Review boards require exactly four images")
    board = bpy.data.scenes.new(f"G5_V2_BOARD_{board_id}")
    bpy.context.window.scene = board
    board.render.engine = "BLENDER_EEVEE"
    board.render.resolution_x = 1920
    board.render.resolution_y = 1080
    board.render.resolution_percentage = 100
    board.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new(f"G5_V2_BOARD_WORLD_{board_id}")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.005, 0.007, 0.010, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    board.world = world
    camera_data = bpy.data.cameras.new(f"G5_V2_BOARD_CAMERA_{board_id}__DATA")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 18.5
    camera = bpy.data.objects.new(f"G5_V2_BOARD_CAMERA_{board_id}", camera_data)
    board.collection.objects.link(camera)
    camera.location = (0.0, 0.0, 10.0)
    board.camera = camera
    positions = [(-8.1, 4.55), (8.1, 4.55), (-8.1, -4.55), (8.1, -4.55)]
    for index, (image_path, (x, y)) in enumerate(zip(image_paths, positions)):
        bpy.ops.mesh.primitive_plane_add(size=2.0, location=(x, y, 0.0))
        plane = bpy.context.active_object
        plane.name = f"G5_V2_BOARD_{board_id}_IMAGE_{index}"
        for owner in list(plane.users_collection):
            owner.objects.unlink(plane)
        board.collection.objects.link(plane)
        plane.scale = (7.88, 4.43, 1.0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        plane.data.materials.append(make_image_material(f"G5_V2_BOARD_{board_id}_MAT_{index}", image_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    bpy.context.window.scene = main_scene


def export_render_only(output_root: Path, excluded_collections: set[str]) -> Path:
    export_path = output_root / "export/inkfall_foundry_press_hall_final_art_v2.glb"
    export_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        if any(collection.name in excluded_collections for collection in obj.users_collection):
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("No render-only objects selected for v2 GLB")
    bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.export_scene.gltf(
        filepath=str(export_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    return export_path


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "source").mkdir(parents=True, exist_ok=True)
    (output_root / "validation").mkdir(parents=True, exist_ok=True)

    v1 = import_v1_builder(repo_root)
    immutable_before = v1.verify_inputs(repo_root)
    v1_before = verify_v1(repo_root)
    v1_blend = repo_root / EXPECTED_V1["blend"][0]
    bpy.ops.wm.open_mainfile(filepath=str(v1_blend), load_ui=False)

    removed_unsupported = delete_unsupported_v1_sheets()
    materials = make_v2_materials()
    replace_v1_materials(materials)
    collections = {
        "stock": make_collection("G5_V2_SUPPORTED_PRINT_STOCK"),
        "supports": make_collection("G5_V2_SUPPORTS_AND_CLAMPS"),
        "fasteners": make_collection("G5_V2_FASTENERS"),
        "conduits": make_collection("G5_V2_CONDUIT_LOGIC"),
        "machinery": make_collection("G5_V2_FOUNDRY_MACHINERY"),
        "paper_drop": make_collection("G5_V2_PAPER_DROP_IDENTITY"),
        "history": make_collection("G5_V2_SURFACE_HISTORY"),
        "signage": make_collection("G5_V2_SAFETY_SIGNAGE"),
        "lights": make_collection("G5_V2_REVIEW_LIGHTING"),
        "cameras": make_collection("G5_V2_REVIEW_CAMERAS"),
    }
    build_supported_print_stock(collections, materials, v1)
    build_fasteners(collections["fasteners"], materials, v1)
    build_conduit_logic(collections["conduits"], collections["supports"], materials, v1)
    build_foundry_machinery(collections["machinery"], collections["supports"], materials, v1)
    build_paper_drop_chute(collections["paper_drop"], collections["supports"], materials, v1)
    build_surface_history(collections["history"], materials, v1)
    build_safety_signage(collections["signage"], materials, v1)
    configure_v2_lighting(collections["lights"])
    cameras = configure_v2_cameras(collections["cameras"])

    scene = bpy.context.scene
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_generator_version"] = GENERATOR_VERSION
    scene["kyx_scope"] = SCOPE
    scene["kyx_map_id"] = "inkfall_foundry"
    scene["kyx_graybox_revision"] = 2
    scene["kyx_graybox_lock_revision"] = 1
    scene["kyx_catalog_default_revision"] = 1
    scene["kyx_authority_collision_included"] = False
    scene["kyx_product_selectable"] = False
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_parent_art_candidate"] = "inkfall_foundry_press_hall_final_art_v1"

    source_blend = output_root / "source/inkfall_foundry_press_hall_final_art_v2.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), check_existing=False)
    render_results = render_views(output_root, cameras)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), check_existing=False)
    export_glb = export_render_only(
        output_root,
        {
            "G5_REVIEW_LIGHTING",
            "G5_REVIEW_CAMERAS",
            "G5_V2_REVIEW_LIGHTING",
            "G5_V2_REVIEW_CAMERAS",
        },
    )

    render_lookup = {(item["view"], item["mode"]): item["path"] for item in render_results}
    board_primary = output_root / "boards/inkfall-press-hall-v2-primary-review-board.png"
    board_material = output_root / "boards/inkfall-press-hall-v2-material-review-board.png"
    create_review_board(
        board_primary,
        [
            render_lookup[("gameplay", "color")],
            render_lookup[("far", "color")],
            render_lookup[("red_fold", "color")],
            render_lookup[("paper_drop", "color")],
        ],
        "PRIMARY",
        scene,
    )
    create_review_board(
        board_material,
        [
            render_lookup[("close", "color")],
            render_lookup[("mid", "color")],
            render_lookup[("gameplay", "grayscale")],
            render_lookup[("paper_drop", "color")],
        ],
        "MATERIAL",
        scene,
    )

    # Board creation switches scenes, so return explicitly before inspecting v2.
    bpy.context.window.scene = scene
    envelope_results = v1.validate_replacement_envelopes()
    immutable_after = v1.verify_inputs(repo_root)
    v1_after = verify_v1(repo_root)
    collision_objects = [obj.name for obj in scene.objects if obj.get("kyx_collision") not in {False, None}]
    detail_counts: dict[str, int] = {}
    for obj in scene.objects:
        family = obj.get("kyx_v2_detail_family")
        if family:
            detail_counts[str(family)] = detail_counts.get(str(family), 0) + 1
    threshold_results = {
        family: {"required": required, "actual": detail_counts.get(family, 0), "passed": detail_counts.get(family, 0) >= required}
        for family, required in REQUIRED_DETAIL_THRESHOLDS.items()
    }
    unsupported_remaining = [
        obj.name
        for obj in scene.objects
        if obj.name.startswith("PH_HANGING_PAPER_") or obj.name.startswith("PH_HANGING_PAPER_SPINE_")
    ]
    supported_stock = [obj for obj in scene.objects if obj.get("kyx_v2_detail_family") == "supported_print_stock"]
    supported_stock_valid = all(int(obj.get("kyx_support_count", 0)) >= 4 for obj in supported_stock)
    material_slots = sorted({str(material.get("kyx_material_slot")) for material in bpy.data.materials if material.get("kyx_material_slot")})
    required_slots = set(v1.REQUIRED_MATERIAL_SLOTS)

    artifact_renders = [
        {
            "view": item["view"],
            "mode": item["mode"],
            "path": item["path"].relative_to(repo_root).as_posix(),
            "sha256": sha256_file(item["path"]),
            "bytes": item["path"].stat().st_size,
            "resolution": [1600, 900],
        }
        for item in render_results
    ]
    artifacts = {
        "sourceBlend": {
            "path": source_blend.relative_to(repo_root).as_posix(),
            "sha256": sha256_file(source_blend),
            "bytes": source_blend.stat().st_size,
        },
        "renderGlb": {
            "path": export_glb.relative_to(repo_root).as_posix(),
            "sha256": sha256_file(export_glb),
            "bytes": export_glb.stat().st_size,
        },
        "renders": artifact_renders,
        "boards": [
            {
                "id": "primary",
                "path": board_primary.relative_to(repo_root).as_posix(),
                "sha256": sha256_file(board_primary),
                "bytes": board_primary.stat().st_size,
                "resolution": [1920, 1080],
            },
            {
                "id": "material",
                "path": board_material.relative_to(repo_root).as_posix(),
                "sha256": sha256_file(board_material),
                "bytes": board_material.stat().st_size,
                "resolution": [1920, 1080],
            },
        ],
    }
    checks = {
        "immutableP67InputsUnchanged": immutable_before == immutable_after,
        "verifiedV1CandidateUnchanged": v1_before == v1_after,
        "catalogDefaultRevisionStill1": immutable_after["catalog_default"].get("assertion") == "DEFAULT_MAP_REVISION_EQUALS_1",
        "authorityCollisionObjectsAbsent": len(collision_objects) == 0,
        "replacementEnvelopesContained": all(item["status"] == "PASS" for item in envelope_results),
        "unsupportedV1FloatingSlabsRemoved": len(removed_unsupported) == 8 and not unsupported_remaining,
        "replacementPrintStockHasPurposefulSupports": len(supported_stock) == 4 and supported_stock_valid,
        "allV2DetailThresholdsMet": all(item["passed"] for item in threshold_results.values()),
        "allSevenSemanticMaterialSlotsPresent": required_slots <= set(material_slots),
        "paperDropIdentityAuthored": detail_counts.get("paper_drop_identity", 0) >= REQUIRED_DETAIL_THRESHOLDS["paper_drop_identity"],
        "requiredReviewViewsRendered": len(render_results) == 7,
        "twoReviewBoardsRendered": board_primary.exists() and board_material.exists(),
    }
    status = "BOUNDED_PRESS_HALL_ART_V2_BUILD_PASS" if all(checks.values()) else "BOUNDED_PRESS_HALL_ART_V2_BUILD_FAIL"
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_final_art_v2_build_report",
        "status": status,
        "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION, "blenderVersion": bpy.app.version_string},
        "scope": SCOPE,
        "binding": {
            "mapId": "inkfall_foundry",
            "grayboxRevision": 2,
            "grayboxLockRevision": 1,
            "catalogDefaultRevision": 1,
            "parentArtCandidate": "inkfall_foundry_press_hall_final_art_v1",
        },
        "checks": checks,
        "detailCounts": detail_counts,
        "detailThresholds": threshold_results,
        "removedUnsupportedV1Objects": removed_unsupported,
        "unsupportedObjectsRemaining": unsupported_remaining,
        "replacementEnvelopeValidation": envelope_results,
        "materialSlots": material_slots,
        "immutableInputsBefore": immutable_before,
        "immutableInputsAfter": immutable_after,
        "verifiedV1Before": v1_before,
        "verifiedV1After": v1_after,
        "collisionObjects": collision_objects,
        "artifacts": artifacts,
        "nonClaims": [
            "G5_NOT_PASSED",
            "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
            "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
            "PERFORMANCE_NOT_MEASURED",
            "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE",
            "COLOR_VISION_REVIEW_NOT_COMPLETE",
            "PRODUCT_INTEGRATION_NOT_COMPLETE",
            "REVISION_2_NOT_DEFAULT_OR_SHIPPING",
            "DEPLOYMENT_NOT_AUTHORIZED",
        ],
    }
    report_path = output_root / "validation/press-hall-final-art-v2-build-report.json"
    stable_json(report_path, report)
    if status != "BOUNDED_PRESS_HALL_ART_V2_BUILD_PASS":
        raise RuntimeError(f"Press Hall v2 validation failed: {checks}; thresholds={threshold_results}")
    print("G5_PRESS_HALL_V2_RESULT=" + json.dumps({"status": status, "report": str(report_path)}, sort_keys=True))


if __name__ == "__main__":
    main()
