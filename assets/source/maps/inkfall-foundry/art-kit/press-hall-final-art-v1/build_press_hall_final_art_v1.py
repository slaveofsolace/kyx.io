"""Build the bounded Inkfall Foundry Press Hall final-art preview.

This is a render-only G5 art strike.  It never edits or exports authority
collision, never changes the catalog default, and never overwrites the sealed
P6.7 revision-2 source.  Geometry is authored in a new Blender file while the
P6.7 hashes and module envelopes are treated as immutable inputs.

Run with Blender 5.1+:
  blender --background --factory-startup --python build_press_hall_final_art_v1.py -- \
    --repo-root <evio-repo> --output-root <press-hall-final-art-v1>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector


GENERATOR_ID = "inkfall_foundry_press_hall_final_art_v1"
GENERATOR_VERSION = 1
SCOPE = "G5_BOUNDED_PRESS_HALL_ART_PREVIEW_ONLY"

EXPECTED_LOCK_SHA256 = "feb6c299c426eff8fccdb3b9a92e3e0f8fd9d73d6dd32b678b68e5ef09178fdd"
EXPECTED_DIMENSION_SHA256 = "66b84c1d23a948b474a4cbc602a3e9b8a170a7f4be67d7d3c4356778825e3d83"
EXPECTED_REVISION2_BLEND_SHA256 = "6dfb09a9c6c92dd830a21e61689ee9b363ef81928a0f8663339e6b868230f224"
EXPECTED_REVISION2_RENDER_SHA256 = "90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634"
EXPECTED_REVISION2_COLLISION_SHA256 = "cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e"

REQUIRED_MATERIAL_SLOTS = (
    "env_base_ceramic",
    "env_secondary_metal",
    "env_ink_surface",
    "env_vermilion_safety",
    "env_garden_fragment",
    "env_functional_marking",
    "env_emissive_signage",
)

# Blender coordinates are X east, Y north, Z up.  These are copied from the
# sealed revision-2 source and are validated against it by hash and envelope.
LOCKED_REPLACEMENT_ENVELOPES = {
    "R_MODULE__PRESS_REACTOR_NORTH": {"center": (0.0, 7.5, 3.0), "size": (3.4, 3.0, 6.0)},
    "R_MODULE__PRESS_REACTOR_SOUTH": {"center": (0.0, -7.5, 3.0), "size": (3.4, 3.0, 6.0)},
    "R_MODULE__PRESS_BAFFLE_E_INNER": {"center": (5.2, -4.7, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_W_INNER": {"center": (-5.2, -4.7, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_E_OUTER": {"center": (10.5, 5.6, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_W_OUTER": {"center": (-10.5, 5.6, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__HALF_COVER_PRESS_E": {"center": (7.0, -1.7, 0.625), "size": (2.4, 0.6, 1.25)},
    "R_MODULE__HALF_COVER_PRESS_W": {"center": (-7.0, 6.0, 0.625), "size": (2.4, 0.6, 1.25)},
    "R_MODULE__FULL_COVER_PRESS_E": {"center": (15.5, 8.0, 1.2), "size": (1.8, 0.8, 2.4)},
    "R_MODULE__FULL_COVER_PRESS_W": {"center": (-10.0, -8.0, 1.2), "size": (1.8, 0.8, 2.4)},
}

MODULE_CONTRACTS = {
    "half_cover": (2.4, 0.6, 1.25),
    "full_cover": (1.8, 0.8, 2.4),
    "press_baffle": (5.0, 0.5, 3.0),
    "press_reactor_shell": (8.0, 8.0, 9.0),
    "red_fold_frame": (6.0, 1.5, 4.5),
    "paper_drop_frame": (6.0, 2.0, 5.0),
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
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.compression = 12
    scene.render.fps = 60
    scene.view_settings.look = "AgX - Medium High Contrast"
    if scene.world is not None:
        scene.world.color = (0.018, 0.023, 0.032)


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def set_object_metadata(
    obj: bpy.types.Object,
    *,
    role: str,
    module_id: str | None = None,
    replacement_target: str | None = None,
    material_slot: str | None = None,
    transition_id: str | None = None,
) -> None:
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = role
    obj["kyx_collision"] = False
    if module_id:
        obj["kyx_module_id"] = module_id
    if replacement_target:
        obj["kyx_replacement_target"] = replacement_target
    if material_slot:
        obj["kyx_material_slot"] = material_slot
    if transition_id:
        obj["kyx_transition_id"] = transition_id


def make_material(
    name: str,
    slot_id: str,
    base: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.68,
    noise_scale: float = 5.0,
    noise_strength: float = 0.08,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base
    material["kyx_material_slot"] = slot_id
    material["kyx_original_material"] = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 20)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (180, 20)
    principled.inputs["Base Color"].default_value = base
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if "Emission Color" in principled.inputs:
        principled.inputs["Emission Color"].default_value = base
    if "Emission Strength" in principled.inputs:
        principled.inputs["Emission Strength"].default_value = emission_strength
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-620, -160)
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 2.5
    noise.inputs["Roughness"].default_value = 0.62
    bump = nodes.new("ShaderNodeBump")
    bump.location = (-80, -175)
    bump.inputs["Strength"].default_value = noise_strength
    bump.inputs["Distance"].default_value = 0.08
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "env_base_ceramic": make_material(
            "KYX_MAT_PAPER_CERAMIC",
            "env_base_ceramic",
            (0.78, 0.745, 0.67, 1.0),
            roughness=0.69,
            noise_scale=7.0,
            noise_strength=0.11,
        ),
        "env_secondary_metal": make_material(
            "KYX_MAT_GRAPHITE_STRUCTURE",
            "env_secondary_metal",
            (0.052, 0.066, 0.086, 1.0),
            metallic=0.62,
            roughness=0.39,
            noise_scale=11.0,
            noise_strength=0.06,
        ),
        "env_ink_surface": make_material(
            "KYX_MAT_MATTE_INK",
            "env_ink_surface",
            (0.006, 0.012, 0.022, 1.0),
            metallic=0.18,
            roughness=0.23,
            noise_scale=3.5,
            noise_strength=0.14,
        ),
        "env_vermilion_safety": make_material(
            "KYX_MAT_VERMILION_SAFETY",
            "env_vermilion_safety",
            (0.64, 0.055, 0.026, 1.0),
            metallic=0.22,
            roughness=0.43,
            noise_scale=9.0,
            noise_strength=0.07,
        ),
        "env_garden_fragment": make_material(
            "KYX_MAT_GARDEN_FRAGMENT",
            "env_garden_fragment",
            (0.12, 0.24, 0.075, 1.0),
            roughness=0.82,
            noise_scale=4.0,
            noise_strength=0.2,
        ),
        "env_functional_marking": make_material(
            "KYX_MAT_FUNCTIONAL_MARKING",
            "env_functional_marking",
            (0.93, 0.57, 0.055, 1.0),
            metallic=0.05,
            roughness=0.5,
            noise_scale=13.0,
            noise_strength=0.03,
        ),
        "env_emissive_signage": make_material(
            "KYX_MAT_AQUA_STATUS",
            "env_emissive_signage",
            (0.02, 0.72, 0.64, 1.0),
            metallic=0.0,
            roughness=0.28,
            noise_scale=18.0,
            noise_strength=0.0,
            emission_strength=3.2,
        ),
        "paper_fiber": make_material(
            "KYX_MAT_PAPER_FIBER",
            "env_base_ceramic",
            (0.9, 0.84, 0.72, 1.0),
            roughness=0.84,
            noise_scale=34.0,
            noise_strength=0.16,
        ),
        "dark_ceramic": make_material(
            "KYX_MAT_SLATE_CERAMIC",
            "env_secondary_metal",
            (0.16, 0.19, 0.23, 1.0),
            metallic=0.16,
            roughness=0.61,
            noise_scale=8.0,
            noise_strength=0.09,
        ),
    }


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    if width <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="KYX_MANUFACTURED_EDGE", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(22.0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    bevel: float = 0.04,
    rotation_z: float = 0.0,
    role: str = "render_shell",
    module_id: str | None = None,
    replacement_target: str | None = None,
    transition_id: str | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0.0, 0.0, rotation_z))
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, collection)
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role=role,
        module_id=module_id,
        replacement_target=replacement_target,
        material_slot=material.get("kyx_material_slot"),
        transition_id=transition_id,
    )
    add_bevel(obj, min(bevel, min(dimensions) * 0.22))
    return obj


def add_profile_prism_xz(
    name: str,
    profile: list[tuple[float, float]],
    depth: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    bevel: float = 0.035,
    role: str = "render_shell",
    module_id: str | None = None,
    replacement_target: str | None = None,
    transition_id: str | None = None,
) -> bpy.types.Object:
    vertices = [(x, -depth * 0.5, z) for x, z in profile] + [
        (x, depth * 0.5, z) for x, z in profile
    ]
    count = len(profile)
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(range(count - 1, -1, -1)))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role=role,
        module_id=module_id,
        replacement_target=replacement_target,
        material_slot=material.get("kyx_material_slot"),
        transition_id=transition_id,
    )
    add_bevel(obj, bevel, 3)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    vertices: int = 48,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.025,
    role: str = "render_shell",
    module_id: str | None = None,
    replacement_target: str | None = None,
    transition_id: str | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    move_to_collection(obj, collection)
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role=role,
        module_id=module_id,
        replacement_target=replacement_target,
        material_slot=material.get("kyx_material_slot"),
        transition_id=transition_id,
    )
    add_bevel(obj, bevel, 2)
    return obj


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    role: str = "render_shell",
    module_id: str | None = None,
    replacement_target: str | None = None,
    transition_id: str | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    move_to_collection(obj, collection)
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role=role,
        module_id=module_id,
        replacement_target=replacement_target,
        material_slot=material.get("kyx_material_slot"),
        transition_id=transition_id,
    )
    return obj


def add_beam_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    vertices: int = 16,
    role: str = "render_detail",
    transition_id: str | None = None,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    midpoint = (a + b) * 0.5
    obj = add_cylinder(
        name,
        radius,
        delta.length,
        tuple(midpoint),
        collection,
        material,
        vertices=vertices,
        bevel=radius * 0.2,
        role=role,
        transition_id=transition_id,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj


def add_annular_sector_horizontal(
    name: str,
    center: tuple[float, float],
    outer_radius: float,
    inner_radius: float,
    z_min: float,
    z_max: float,
    start_degrees: float,
    end_degrees: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    module_id: str,
    replacement_target: str,
) -> bpy.types.Object:
    steps = max(8, int(abs(end_degrees - start_degrees) / 5.0))
    angles = [
        math.radians(start_degrees + (end_degrees - start_degrees) * index / steps)
        for index in range(steps + 1)
    ]
    vertices: list[tuple[float, float, float]] = []
    cx, cy = center
    for z in (z_min, z_max):
        for radius in (outer_radius, inner_radius):
            for angle in angles:
                vertices.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, z))
    ring = steps + 1
    bo = 0
    bi = ring
    to = ring * 2
    ti = ring * 3
    faces: list[tuple[int, ...]] = []
    for index in range(steps):
        nxt = index + 1
        faces.extend(
            [
                (bo + index, bo + nxt, to + nxt, to + index),
                (bi + nxt, bi + index, ti + index, ti + nxt),
                (to + index, to + nxt, ti + nxt, ti + index),
                (bo + nxt, bo + index, bi + index, bi + nxt),
            ]
        )
    faces.extend(
        [
            (bo, to, ti, bi),
            (bo + steps, bi + steps, ti + steps, to + steps),
        ]
    )
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role="landmark_render_shell",
        module_id=module_id,
        replacement_target=replacement_target,
        material_slot=material.get("kyx_material_slot"),
    )
    add_bevel(obj, 0.028, 2)
    return obj


def add_annular_sector_vertical(
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
    *,
    transition_id: str,
) -> bpy.types.Object:
    steps = max(8, int(abs(end_degrees - start_degrees) / 5.0))
    angles = [
        math.radians(start_degrees + (end_degrees - start_degrees) * index / steps)
        for index in range(steps + 1)
    ]
    cx, cz = center_xz
    vertices: list[tuple[float, float, float]] = []
    for y in (y_center - depth * 0.5, y_center + depth * 0.5):
        for radius in (outer_radius, inner_radius):
            for angle in angles:
                vertices.append((cx + math.cos(angle) * radius, y, cz + math.sin(angle) * radius))
    ring = steps + 1
    no = 0
    ni = ring
    fo = ring * 2
    fi = ring * 3
    faces: list[tuple[int, ...]] = []
    for index in range(steps):
        nxt = index + 1
        faces.extend(
            [
                (no + index, fo + index, fo + nxt, no + nxt),
                (ni + nxt, fi + nxt, fi + index, ni + index),
                (fo + index, fi + index, fi + nxt, fo + nxt),
                (no + nxt, ni + nxt, ni + index, no + index),
            ]
        )
    faces.extend(
        [
            (no, ni, fi, fo),
            (no + steps, fo + steps, fi + steps, ni + steps),
        ]
    )
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role="transition_render_shell",
        module_id="red_fold_frame",
        material_slot=material.get("kyx_material_slot"),
        transition_id=transition_id,
    )
    add_bevel(obj, 0.026, 2)
    return obj


def add_floor_mark_triangle(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float],
    yaw: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    width, length = size
    vertices = [(-width * 0.5, -length * 0.5, 0.0), (width * 0.5, -length * 0.5, 0.0), (0.0, length * 0.5, 0.0)]
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], [(0, 1, 2)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    obj.rotation_euler.z = yaw
    obj.data.materials.append(material)
    set_object_metadata(
        obj,
        role="flush_functional_marking",
        material_slot=material.get("kyx_material_slot"),
    )
    return obj


def build_architecture(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    architecture = collections["architecture"]
    details = collections["details"]
    ceramic = materials["env_base_ceramic"]
    metal = materials["env_secondary_metal"]
    slate = materials["dark_ceramic"]
    ink = materials["env_ink_surface"]
    vermilion = materials["env_vermilion_safety"]
    marking = materials["env_functional_marking"]
    aqua = materials["env_emissive_signage"]

    add_box("PH_SUBFLOOR_INK_BASIN", (44.0, 20.0, 0.34), (0.0, 0.0, -0.24), architecture, ink, bevel=0.08)
    for ix, x in enumerate(range(-20, 21, 4)):
        for iy, y in enumerate(range(-8, 9, 4)):
            material = ceramic if (ix + iy) % 5 else materials["dark_ceramic"]
            tile = add_box(
                f"PH_FLOOR_PANEL_{ix:02d}_{iy:02d}",
                (3.84, 3.84, 0.18),
                (float(x), float(y), -0.105),
                architecture,
                material,
                bevel=0.055,
                role="render_shell_over_locked_surface",
                module_id="floor_4000",
            )
            tile["kyx_contract_dimensions_mm"] = "[4000,250,4000]"
            if (ix * 3 + iy) % 7 == 0:
                add_box(
                    f"PH_FLOOR_SERVICE_INSET_{ix:02d}_{iy:02d}",
                    (1.2, 0.055, 0.018),
                    (x + 0.75, y - 1.2, -0.003),
                    details,
                    slate,
                    bevel=0.008,
                    role="flush_render_detail",
                )

    for index, x in enumerate((-18.0, -10.0, -2.0, 6.0, 14.0)):
        add_box(
            f"PH_SOUTH_INK_CHANNEL_RIB_{index:02d}",
            (5.2, 0.18, 0.16),
            (x, -9.28, -0.01),
            architecture,
            metal,
            bevel=0.04,
            role="render_only_channel_edge",
        )
    add_box("PH_SOUTH_INK_CHANNEL", (41.5, 0.92, 0.18), (0.0, -9.35, -0.10), architecture, ink, bevel=0.06)
    add_box("PH_NORTH_SERVICE_CHANNEL", (35.0, 0.55, 0.15), (3.0, 9.33, -0.06), architecture, ink, bevel=0.04)

    # Four deliberately sparse route chevrons; meaning remains shape-readable.
    for index, (x, y, yaw) in enumerate(
        [(-18.0, 0.0, -math.pi / 2), (18.0, 0.0, math.pi / 2), (-3.0, 5.2, 0.0), (1.0, -4.2, math.pi)]
    ):
        add_floor_mark_triangle(
            f"PH_ROUTE_CHEVRON_{index:02d}",
            (x, y, 0.003),
            (0.75, 1.35),
            yaw,
            details,
            vermilion if index == 3 else marking,
        )

    # Wall panels use a dark structural cassette plus a floating ceramic face.
    def wall_panel(stem: str, x: float, y: float, z: float, width: float, facing_north: bool) -> None:
        add_box(f"{stem}_CASSETTE", (width, 0.36, 5.8), (x, y, z), architecture, metal, bevel=0.08)
        face_y = y + (0.20 if facing_north else -0.20)
        add_box(f"{stem}_CERAMIC_FACE", (width - 0.28, 0.10, 5.45), (x, face_y, z + 0.05), architecture, ceramic, bevel=0.075)
        add_box(f"{stem}_MID_RAIL", (width - 0.14, 0.14, 0.18), (x, face_y + (0.025 if facing_north else -0.025), z - 0.75), details, slate, bevel=0.03)
        add_box(f"{stem}_TOP_RAIL", (width - 0.14, 0.14, 0.22), (x, face_y + (0.025 if facing_north else -0.025), z + 2.28), details, slate, bevel=0.03)

    for index, x in enumerate((-20.0, -16.0, -12.0, 4.0, 8.0, 12.0, 16.0, 20.0)):
        wall_panel(f"PH_NORTH_WALL_{index:02d}", x, 10.35, 3.1, 3.75, False)
    for index, x in enumerate((-20.0, -16.0, -12.0, -8.0, 8.0, 12.0, 16.0, 20.0)):
        wall_panel(f"PH_SOUTH_WALL_{index:02d}", x, -10.35, 3.1, 3.75, True)

    # Side portals remain open over the exact west/east approach lanes.
    for side, x, sign in (("WEST", -22.35, 1.0), ("EAST", 22.35, -1.0)):
        for y in (-7.2, 7.2):
            add_box(f"PH_{side}_WALL_{int(y):+03d}", (0.36, 5.0, 5.8), (x, y, 3.1), architecture, metal, bevel=0.08)
            add_box(
                f"PH_{side}_WALL_FACE_{int(y):+03d}",
                (0.10, 4.68, 5.42),
                (x + sign * 0.20, y, 3.15),
                architecture,
                ceramic,
                bevel=0.07,
            )
        for y in (-3.1, 3.1):
            add_box(f"PH_{side}_PORTAL_COLUMN_{int(y):+03d}", (0.72, 0.72, 7.9), (x, y, 3.95), architecture, metal, bevel=0.09)
        add_box(f"PH_{side}_PORTAL_LINTEL", (0.82, 6.9, 0.72), (x, 0.0, 7.55), architecture, metal, bevel=0.1)
        add_box(f"PH_{side}_PORTAL_ACCENT", (0.09, 5.4, 0.22), (x + sign * 0.43, 0.0, 6.75), details, vermilion, bevel=0.025)

    # Structural rhythm and ceiling trusses are above every locked clearance.
    for index, x in enumerate((-18.0, -10.0, -2.0, 6.0, 14.0, 20.0)):
        for y in (-9.7, 9.7):
            add_box(f"PH_COLUMN_{index:02d}_{'N' if y > 0 else 'S'}", (0.58, 0.58, 8.7), (x, y, 4.35), architecture, metal, bevel=0.08, module_id="column_500x3000")
            add_box(f"PH_COLUMN_CAP_{index:02d}_{'N' if y > 0 else 'S'}", (0.86, 0.86, 0.28), (x, y, 8.45), details, ceramic, bevel=0.05)
        add_box(f"PH_CEILING_TRUSS_{index:02d}", (0.54, 19.2, 0.58), (x, 0.0, 8.52), architecture, metal, bevel=0.09)
        for y in (-5.4, 0.0, 5.4):
            add_box(f"PH_TRUSS_LIGHT_{index:02d}_{int(y):+03d}", (0.24, 3.1, 0.08), (x + 0.31, y, 8.22), details, aqua, bevel=0.025)

    # Suspended paper baffles create the high silhouette without entering play height.
    for index, (x, y, length, drop, yaw) in enumerate(
        [(-13.0, 3.0, 4.6, 2.2, 0.18), (-6.5, 1.5, 5.2, 2.7, -0.12), (5.8, 2.7, 4.8, 2.4, 0.15), (13.2, -1.5, 4.2, 2.0, -0.18)]
    ):
        add_box(
            f"PH_HANGING_PAPER_{index:02d}",
            (length, 0.11, drop),
            (x, y, 8.0 - drop * 0.5),
            architecture,
            materials["paper_fiber"],
            bevel=0.055,
            rotation_z=yaw,
            role="overhead_render_only",
        )
        add_box(
            f"PH_HANGING_PAPER_SPINE_{index:02d}",
            (length + 0.12, 0.18, 0.16),
            (x, y, 7.98),
            details,
            metal,
            bevel=0.035,
            rotation_z=yaw,
            role="overhead_render_only",
        )


def build_baffle(
    stem: str,
    center: tuple[float, float, float],
    replacement_target: str,
    collection: bpy.types.Collection,
    details: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    mirrored: bool,
) -> None:
    profile = [(-2.46, -1.45), (1.45, -1.45), (2.46, -0.55), (2.46, 1.45), (-1.65, 1.45), (-2.46, 0.68)]
    if mirrored:
        profile = [(-x, z) for x, z in reversed(profile)]
    base = add_profile_prism_xz(
        f"{stem}_STRUCTURAL_SHELL",
        profile,
        0.38,
        center,
        collection,
        materials["env_secondary_metal"],
        bevel=0.035,
        module_id="press_baffle",
        replacement_target=replacement_target,
    )
    base["kyx_contract_dimensions_mm"] = "[5000,3000,500]"
    inset_profile = [(x * 0.88, z * 0.84) for x, z in profile]
    for side_index, side in enumerate((-1.0, 1.0)):
        face = add_profile_prism_xz(
            f"{stem}_CERAMIC_FACE_{side_index}",
            inset_profile,
            0.040,
            (center[0], center[1] + side * 0.208, center[2]),
            collection,
            materials["env_base_ceramic"],
            bevel=0.025,
            module_id="press_baffle",
            replacement_target=replacement_target,
        )
        face["kyx_contract_dimensions_mm"] = "[5000,3000,500]"
        add_box(
            f"{stem}_INK_SEAM_{side_index}",
            (2.65, 0.014, 0.15),
            (center[0] + (-0.55 if mirrored else 0.55), center[1] + side * 0.232, center[2] + 0.28),
            details,
            materials["env_ink_surface"],
            bevel=0.005,
            rotation_z=0.0,
            module_id="press_baffle",
            replacement_target=replacement_target,
        )
        add_box(
            f"{stem}_VERMILION_TAB_{side_index}",
            (0.72, 0.014, 0.31),
            (center[0] + (1.72 if not mirrored else -1.72), center[1] + side * 0.232, center[2] - 0.82),
            details,
            materials["env_vermilion_safety"],
            bevel=0.005,
            module_id="press_baffle",
            replacement_target=replacement_target,
        )


def build_cover(
    stem: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    module_id: str,
    replacement_target: str,
    collection: bpy.types.Collection,
    details: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    mirrored: bool,
) -> None:
    width, depth, height = size
    x0 = width * 0.5 - 0.035
    z0 = height * 0.5 - 0.035
    shoulder = width * (0.30 if mirrored else 0.24)
    profile = [(-x0, -z0), (x0, -z0), (x0, z0 * 0.62), (shoulder, z0), (-x0 * 0.78, z0), (-x0, z0 * 0.72)]
    if mirrored:
        profile = [(-x, z) for x, z in reversed(profile)]
    body = add_profile_prism_xz(
        f"{stem}_CHAMFERED_BODY",
        profile,
        depth - 0.035,
        center,
        collection,
        materials["env_secondary_metal"],
        bevel=0.03,
        module_id=module_id,
        replacement_target=replacement_target,
    )
    body["kyx_contract_dimensions_mm"] = json.dumps([int(width * 1000), int(height * 1000), int(depth * 1000)])
    inset = [(x * 0.84, z * 0.82) for x, z in profile]
    for side_index, side in enumerate((-1.0, 1.0)):
        add_profile_prism_xz(
            f"{stem}_CERAMIC_ARMOR_{side_index}",
            inset,
            0.035,
            (center[0], center[1] + side * (depth * 0.5 - 0.025), center[2] + 0.02),
            collection,
            materials["env_base_ceramic"],
            bevel=0.022,
            module_id=module_id,
            replacement_target=replacement_target,
        )
        add_box(
            f"{stem}_VALUE_BREAK_{side_index}",
            (width * 0.46, 0.012, 0.12),
            (center[0] - width * 0.12, center[1] + side * (depth * 0.5 - 0.009), center[2] + height * 0.08),
            details,
            materials["env_ink_surface"],
            bevel=0.004,
            module_id=module_id,
            replacement_target=replacement_target,
        )
    add_box(
        f"{stem}_SAFETY_CUT",
        (0.13, depth - 0.08, height * 0.52),
        (center[0] + (-width * 0.34 if mirrored else width * 0.34), center[1], center[2] - height * 0.10),
        details,
        materials["env_vermilion_safety"],
        bevel=0.015,
        module_id=module_id,
        replacement_target=replacement_target,
    )


def build_reactor_half(
    stem: str,
    center_y: float,
    replacement_target: str,
    collection: bpy.types.Collection,
    details: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
    *,
    north_half: bool,
) -> None:
    center = (0.0, center_y)
    module_id = "press_reactor_shell"
    metal = materials["env_secondary_metal"]
    ceramic = materials["env_base_ceramic"]
    ink = materials["env_ink_surface"]
    vermilion = materials["env_vermilion_safety"]
    aqua = materials["env_emissive_signage"]

    add_cylinder(
        f"{stem}_BASE_PLINTH",
        1.43,
        0.34,
        (0.0, center_y, 0.19),
        collection,
        metal,
        vertices=64,
        bevel=0.06,
        module_id=module_id,
        replacement_target=replacement_target,
    )
    add_cylinder(
        f"{stem}_INK_CORE",
        0.68,
        5.18,
        (0.0, center_y, 2.84),
        collection,
        ink,
        vertices=48,
        bevel=0.035,
        module_id=module_id,
        replacement_target=replacement_target,
    )
    ranges = (
        [(-54.0, 18.0), (24.0, 96.0), (102.0, 174.0), (180.0, 252.0)]
        if north_half
        else [(-174.0, -102.0), (-96.0, -24.0), (-18.0, 54.0), (126.0, 174.0)]
    )
    for band_index, (z_min, z_max) in enumerate(((0.56, 2.53), (2.82, 5.58))):
        for sector_index, (start, end) in enumerate(ranges):
            material = ceramic if (sector_index + band_index) % 3 else materials["paper_fiber"]
            add_annular_sector_horizontal(
                f"{stem}_CERAMIC_SECTOR_B{band_index}_S{sector_index}",
                center,
                1.46,
                1.23,
                z_min,
                z_max,
                start,
                end,
                collection,
                material,
                module_id=module_id,
                replacement_target=replacement_target,
            )
    for ring_index, z in enumerate((0.54, 2.65, 5.61)):
        add_torus(
            f"{stem}_STRUCTURAL_RING_{ring_index}",
            1.31,
            0.105,
            (0.0, center_y, z),
            collection,
            metal,
            module_id=module_id,
            replacement_target=replacement_target,
        )
    facing = -1.0 if north_half else 1.0
    for rod_index, x in enumerate((-0.50, 0.50)):
        add_cylinder(
            f"{stem}_HYDRAULIC_ROD_{rod_index}",
            0.105,
            4.35,
            (x, center_y + facing * 1.20, 2.82),
            details,
            metal,
            vertices=24,
            bevel=0.025,
            module_id=module_id,
            replacement_target=replacement_target,
        )
        add_cylinder(
            f"{stem}_STATUS_LAMP_{rod_index}",
            0.15,
            0.12,
            (x, center_y + facing * 1.31, 4.78),
            details,
            aqua,
            vertices=24,
            rotation=(math.pi / 2, 0.0, 0.0),
            bevel=0.015,
            module_id=module_id,
            replacement_target=replacement_target,
        )
    add_box(
        f"{stem}_VERMILION_INDEX",
        (0.42, 0.13, 2.05),
        (1.18 if north_half else -1.18, center_y + facing * 1.26, 3.55),
        details,
        vermilion,
        bevel=0.025,
        module_id=module_id,
        replacement_target=replacement_target,
    )
    add_box(
        f"{stem}_TOP_PRESS_CAP",
        (1.62, 1.62, 0.34),
        (0.0, center_y, 5.78),
        details,
        metal,
        bevel=0.12,
        module_id=module_id,
        replacement_target=replacement_target,
    )


def build_press_modules(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> None:
    modules = collections["modules"]
    details = collections["details"]
    for stem, key, mirror in (
        ("PH_BAFFLE_E_INNER", "R_MODULE__PRESS_BAFFLE_E_INNER", False),
        ("PH_BAFFLE_W_INNER", "R_MODULE__PRESS_BAFFLE_W_INNER", True),
        ("PH_BAFFLE_E_OUTER", "R_MODULE__PRESS_BAFFLE_E_OUTER", True),
        ("PH_BAFFLE_W_OUTER", "R_MODULE__PRESS_BAFFLE_W_OUTER", False),
    ):
        center = LOCKED_REPLACEMENT_ENVELOPES[key]["center"]
        build_baffle(stem, center, key, modules, details, materials, mirrored=mirror)
    for stem, key, module_id, mirrored in (
        ("PH_HALF_COVER_E", "R_MODULE__HALF_COVER_PRESS_E", "half_cover", False),
        ("PH_HALF_COVER_W", "R_MODULE__HALF_COVER_PRESS_W", "half_cover", True),
        ("PH_FULL_COVER_E", "R_MODULE__FULL_COVER_PRESS_E", "full_cover", True),
        ("PH_FULL_COVER_W", "R_MODULE__FULL_COVER_PRESS_W", "full_cover", False),
    ):
        envelope = LOCKED_REPLACEMENT_ENVELOPES[key]
        build_cover(
            stem,
            envelope["center"],
            envelope["size"],
            module_id,
            key,
            modules,
            details,
            materials,
            mirrored=mirrored,
        )
    build_reactor_half(
        "PH_REACTOR_NORTH",
        7.5,
        "R_MODULE__PRESS_REACTOR_NORTH",
        modules,
        details,
        materials,
        north_half=True,
    )
    build_reactor_half(
        "PH_REACTOR_SOUTH",
        -7.5,
        "R_MODULE__PRESS_REACTOR_SOUTH",
        modules,
        details,
        materials,
        north_half=False,
    )


def build_red_fold_transition(
    collection: bpy.types.Collection,
    details: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    metal = materials["env_secondary_metal"]
    vermilion = materials["env_vermilion_safety"]
    ink = materials["env_ink_surface"]
    aqua = materials["env_emissive_signage"]
    transition = "red_fold"
    # Press Hall exit ring: outer 4.5 m diameter, 3.7 m shape-clear inner span.
    for index, (start, end, material) in enumerate(
        [(-170.0, -12.0, metal), (12.0, 72.0, vermilion), (108.0, 192.0, metal)]
    ):
        add_annular_sector_vertical(
            f"RED_FOLD_EXIT_RING_{index}",
            (1.0, 3.25),
            -5.08,
            0.68,
            2.24,
            1.86,
            start,
            end,
            collection,
            material,
            transition_id=transition,
        )
    for index, x in enumerate((-1.25, 3.25)):
        add_box(
            f"RED_FOLD_EXIT_PYLON_{index}",
            (0.34, 0.72, 2.42),
            (x, -5.08, 2.22),
            collection,
            metal,
            bevel=0.06,
            module_id="red_fold_frame",
            transition_id=transition,
        )
        add_box(
            f"RED_FOLD_EXIT_PYLON_CUT_{index}",
            (0.37, 0.76, 0.36),
            (x, -5.08, 2.65 + index * 0.34),
            details,
            vermilion,
            bevel=0.04,
            module_id="red_fold_frame",
            transition_id=transition,
        )
    add_cylinder(
        "RED_FOLD_EXIT_PAD_INK",
        1.86,
        0.10,
        (1.0, -5.0, 0.94),
        collection,
        ink,
        vertices=64,
        bevel=0.035,
        module_id="red_fold_frame",
        transition_id=transition,
    )
    add_torus(
        "RED_FOLD_EXIT_PAD_CONFIRMATION",
        1.48,
        0.095,
        (1.0, -5.0, 1.01),
        details,
        vermilion,
        module_id="red_fold_frame",
        transition_id=transition,
    )
    for x in (0.45, 1.0, 1.55):
        add_box(
            f"RED_FOLD_EXIT_AQUA_TICK_{int(x * 100):03d}",
            (0.16, 0.08, 0.06),
            (x, -4.62, 3.64),
            details,
            aqua,
            bevel=0.015,
            module_id="red_fold_frame",
            transition_id=transition,
        )

    # Lower-tier destination frame makes the transition legible as a paired system.
    for index, (start, end, material) in enumerate(
        [(-168.0, -18.0, metal), (18.0, 78.0, vermilion), (102.0, 192.0, metal)]
    ):
        add_annular_sector_vertical(
            f"RED_FOLD_LOWER_RING_{index}",
            (-4.0, -0.75),
            -10.15,
            0.68,
            2.22,
            1.84,
            start,
            end,
            collection,
            material,
            transition_id=transition,
        )
    add_cylinder(
        "RED_FOLD_LOWER_PAD",
        1.84,
        0.10,
        (-4.0, -10.0, -2.94),
        collection,
        ink,
        vertices=64,
        bevel=0.035,
        module_id="red_fold_frame",
        transition_id=transition,
    )
    add_torus(
        "RED_FOLD_LOWER_PAD_CONFIRMATION",
        1.46,
        0.09,
        (-4.0, -10.0, -2.87),
        details,
        vermilion,
        module_id="red_fold_frame",
        transition_id=transition,
    )


def build_paper_drop_transition(
    collection: bpy.types.Collection,
    details: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> None:
    metal = materials["env_secondary_metal"]
    ceramic = materials["env_base_ceramic"]
    paper = materials["paper_fiber"]
    garden = materials["env_garden_fragment"]
    marking = materials["env_functional_marking"]
    transition = "paper_drop"
    for index, x in enumerate((-6.72, -1.28)):
        add_box(
            f"PAPER_DROP_PYLON_{index}",
            (0.52, 1.45, 4.55),
            (x, 9.55, 2.35),
            collection,
            metal,
            bevel=0.085,
            module_id="paper_drop_frame",
            transition_id=transition,
        )
        add_box(
            f"PAPER_DROP_PYLON_FACE_{index}",
            (0.34, 1.50, 3.62),
            (x, 9.53, 2.24),
            details,
            ceramic,
            bevel=0.06,
            module_id="paper_drop_frame",
            transition_id=transition,
        )
        for slot in (0, 1, 2):
            add_box(
                f"PAPER_DROP_PYLON_SLOT_{index}_{slot}",
                (0.37, 0.06, 0.10),
                (x, 8.78, 1.22 + slot * 1.02),
                details,
                marking if slot == 1 else metal,
                bevel=0.012,
                module_id="paper_drop_frame",
                transition_id=transition,
            )
    add_box(
        "PAPER_DROP_LINTEL",
        (5.96, 1.52, 0.54),
        (-4.0, 9.55, 4.72),
        collection,
        metal,
        bevel=0.09,
        module_id="paper_drop_frame",
        transition_id=transition,
    )
    add_box(
        "PAPER_DROP_LINTEL_PAPER_FACE",
        (5.18, 0.10, 0.30),
        (-4.0, 8.78, 4.72),
        details,
        paper,
        bevel=0.05,
        module_id="paper_drop_frame",
        transition_id=transition,
    )
    # Hanging torn sheets stop above the locked 3 m route clearance.
    for index, (x, width, drop) in enumerate(((-5.75, 1.45, 1.35), (-4.0, 1.55, 0.95), (-2.25, 1.30, 1.55))):
        profile = [(-width * 0.5, 0.0), (width * 0.5, 0.0), (width * 0.42, -drop * 0.82), (0.08, -drop), (-width * 0.45, -drop * 0.72)]
        add_profile_prism_xz(
            f"PAPER_DROP_HANGING_SHEET_{index}",
            profile,
            0.085,
            (x, 8.92, 7.35),
            collection,
            paper,
            bevel=0.025,
            role="overhead_render_only",
            module_id="paper_drop_frame",
            transition_id=transition,
        )
    add_box(
        "PAPER_DROP_LANDING_VALUE_FRAME",
        (4.0, 0.12, 0.028),
        (-3.0, 6.05, 0.008),
        details,
        marking,
        bevel=0.01,
        module_id="floor_mark_1000",
        transition_id=transition,
    )

    # One controlled garden/conduit seam, placed against the wall outside landing.
    add_box(
        "PAPER_DROP_GARDEN_PLINTH",
        (2.0, 1.15, 0.52),
        (1.05, 9.30, 0.25),
        collection,
        ceramic,
        bevel=0.11,
        module_id="garden_planter_3000",
        transition_id=transition,
    )
    add_box(
        "PAPER_DROP_GARDEN_SOIL",
        (1.62, 0.82, 0.14),
        (1.05, 9.20, 0.53),
        details,
        garden,
        bevel=0.05,
        module_id="garden_planter_3000",
        transition_id=transition,
    )
    branch_points = [
        ((1.05, 9.42, 0.52), (0.92, 9.60, 2.35), 0.085),
        ((0.92, 9.60, 2.15), (1.48, 9.68, 3.55), 0.060),
        ((0.96, 9.60, 1.55), (0.38, 9.68, 2.68), 0.050),
        ((1.45, 9.68, 3.42), (1.12, 9.70, 4.40), 0.045),
    ]
    for index, (start, end, radius) in enumerate(branch_points):
        add_beam_between(
            f"PAPER_DROP_GARDEN_CONDUIT_{index}",
            start,
            end,
            radius,
            details,
            garden,
            vertices=12,
            role="garden_render_detail",
            transition_id=transition,
        )
    leaf_locations = [(0.55, 9.68, 2.60), (1.38, 9.72, 3.28), (1.05, 9.73, 4.18), (1.58, 9.70, 2.52), (0.72, 9.71, 3.32)]
    for index, location in enumerate(leaf_locations):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.19, location=location)
        leaf = bpy.context.active_object
        leaf.name = f"PAPER_DROP_GARDEN_LEAF_{index}"
        leaf.scale = (1.8, 0.34, 0.75)
        leaf.rotation_euler.z = (index - 2) * 0.55
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        move_to_collection(leaf, details)
        leaf.data.materials.append(garden)
        set_object_metadata(leaf, role="garden_render_detail", material_slot="env_garden_fragment", transition_id=transition)


def configure_stage(
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> dict[str, bpy.types.Object]:
    lights = collections["lights"]
    cameras = collections["cameras"]
    scene = bpy.context.scene
    world = bpy.data.worlds.new("KYX_PRESS_HALL_WORLD") if not bpy.data.worlds else list(bpy.data.worlds)[0]
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.035, 0.050, 0.073, 1.0)
    background.inputs["Strength"].default_value = 0.28

    def area(name: str, location: tuple[float, float, float], energy: float, color: tuple[float, float, float], size: float, target: tuple[float, float, float]) -> None:
        data = bpy.data.lights.new(name=f"{name}__DATA", type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "RECTANGLE"
        data.size = size
        data.size_y = size * 0.52
        obj = bpy.data.objects.new(name, data)
        lights.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
        set_object_metadata(obj, role="review_lighting")

    area("PH_KEY_NORTH", (-6.0, 3.0, 12.0), 2100.0, (1.0, 0.89, 0.72), 9.0, (0.0, 0.0, 1.8))
    area("PH_KEY_SOUTH", (10.0, -5.0, 10.5), 1650.0, (0.72, 0.84, 1.0), 8.0, (2.0, 1.0, 1.5))
    area("PH_FILL_WEST", (-24.0, -1.0, 5.0), 1250.0, (0.66, 0.82, 1.0), 7.0, (-4.0, 0.0, 2.0))
    area("PH_FILL_EAST", (24.0, 3.0, 5.5), 1100.0, (1.0, 0.55, 0.40), 6.0, (4.0, 0.0, 2.0))
    area("PH_REACTOR_RIM_N", (0.0, 4.5, 5.6), 720.0, (0.14, 0.78, 0.70), 3.4, (0.0, 7.5, 3.0))
    area("PH_REACTOR_RIM_S", (0.0, -4.5, 5.4), 680.0, (0.85, 0.16, 0.08), 3.0, (0.0, -7.5, 3.0))

    def camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> bpy.types.Object:
        data = bpy.data.cameras.new(f"{name}__DATA")
        data.lens = lens
        data.sensor_width = 36.0
        data.dof.use_dof = False
        obj = bpy.data.objects.new(name, data)
        cameras.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
        set_object_metadata(obj, role="deterministic_review_camera")
        return obj

    return {
        "gameplay": camera("CAM_PRESS_HALL_GAMEPLAY", (-18.8, -7.8, 1.72), (0.0, 1.6, 2.15), 31.0),
        "close": camera("CAM_PRESS_HALL_CLOSE", (-9.2, -1.2, 2.35), (0.0, 7.35, 3.0), 38.0),
        "mid": camera("CAM_PRESS_HALL_MID", (17.5, -6.8, 3.35), (-2.0, 2.4, 2.25), 39.0),
        "far": camera("CAM_PRESS_HALL_FAR", (-27.0, 0.0, 4.25), (0.5, 0.0, 2.15), 34.0),
        "red_fold": camera("CAM_RED_FOLD_TRANSITION", (12.0, 2.0, 3.0), (1.0, -5.15, 2.70), 46.0),
        "paper_drop": camera("CAM_PAPER_DROP_TRANSITION", (-14.0, -4.0, 2.60), (-4.0, 9.20, 3.30), 42.0),
    }


def render_views(output_root: Path, cameras: dict[str, bpy.types.Object]) -> list[dict[str, Any]]:
    render_dir = output_root / "renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    results: list[dict[str, Any]] = []
    for view_id in ("gameplay", "close", "mid", "far", "red_fold", "paper_drop"):
        path = render_dir / f"inkfall-press-hall-v1-{view_id}-color.png"
        scene.camera = cameras[view_id]
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "mode": "color", "path": path})

    material_state: list[tuple[bpy.types.Material, tuple[float, float, float, float], tuple[float, float, float, float] | None]] = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if principled is None:
            continue
        base = tuple(principled.inputs["Base Color"].default_value)
        emission_socket = principled.inputs.get("Emission Color")
        emission = tuple(emission_socket.default_value) if emission_socket else None
        luminance = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
        gray = (luminance, luminance, luminance, base[3])
        principled.inputs["Base Color"].default_value = gray
        material.diffuse_color = gray
        if emission_socket and emission is not None:
            e_luma = 0.2126 * emission[0] + 0.7152 * emission[1] + 0.0722 * emission[2]
            emission_socket.default_value = (e_luma, e_luma, e_luma, emission[3])
        material_state.append((material, base, emission))
    gray_path = render_dir / "inkfall-press-hall-v1-gameplay-grayscale.png"
    scene.camera = cameras["gameplay"]
    scene.render.filepath = str(gray_path)
    bpy.ops.render.render(write_still=True)
    results.append({"view": "gameplay", "mode": "grayscale", "path": gray_path})
    for material, base, emission in material_state:
        principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        principled.inputs["Base Color"].default_value = base
        material.diffuse_color = base
        if emission is not None and principled.inputs.get("Emission Color"):
            principled.inputs["Emission Color"].default_value = emission
    return results


def export_render_only(output_root: Path, export_collections: Iterable[bpy.types.Collection]) -> Path:
    export_path = output_root / "export" / "inkfall_foundry_press_hall_final_art_v1.glb"
    export_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected: list[bpy.types.Object] = []
    for collection in export_collections:
        for obj in collection.all_objects:
            if obj.type in {"MESH", "CURVE"}:
                obj.select_set(True)
                selected.append(obj)
    if not selected:
        raise RuntimeError("No render-only objects selected for GLB export")
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


def object_world_bounds(objects: Iterable[bpy.types.Object]) -> tuple[Vector, Vector] | None:
    points: list[Vector] = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        return None
    return (
        Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
        Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))),
    )


def validate_replacement_envelopes() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    tolerance = 0.004
    for target, envelope in sorted(LOCKED_REPLACEMENT_ENVELOPES.items()):
        members = [obj for obj in bpy.data.objects if obj.get("kyx_replacement_target") == target]
        bounds = object_world_bounds(members)
        if bounds is None:
            results.append({"target": target, "status": "FAIL", "reason": "no authored replacement members"})
            continue
        lower, upper = bounds
        center = Vector(envelope["center"])
        half = Vector(envelope["size"]) * 0.5
        expected_lower = center - half
        expected_upper = center + half
        contained = all(
            lower[index] >= expected_lower[index] - tolerance and upper[index] <= expected_upper[index] + tolerance
            for index in range(3)
        )
        results.append(
            {
                "target": target,
                "status": "PASS" if contained else "FAIL",
                "memberCount": len(members),
                "lockedCenterMeters": [round(v, 6) for v in center],
                "lockedSizeMeters": [round(v, 6) for v in envelope["size"]],
                "authoredLowerMeters": [round(v, 6) for v in lower],
                "authoredUpperMeters": [round(v, 6) for v in upper],
            }
        )
    return results


def verify_inputs(repo_root: Path) -> dict[str, dict[str, str]]:
    paths = {
        "graybox_lock": repo_root / "assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json",
        "dimension_contract": repo_root / "assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json",
        "revision2_blend": repo_root / "assets/source/maps/inkfall-foundry/revisions/revision-2/source/inkfall_foundry.blend",
        "revision2_render": repo_root / "assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb",
        "revision2_collision": repo_root / "assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb",
        "catalog_default": repo_root / "src/content/maps/constants.ts",
    }
    expected = {
        "graybox_lock": EXPECTED_LOCK_SHA256,
        "dimension_contract": EXPECTED_DIMENSION_SHA256,
        "revision2_blend": EXPECTED_REVISION2_BLEND_SHA256,
        "revision2_render": EXPECTED_REVISION2_RENDER_SHA256,
        "revision2_collision": EXPECTED_REVISION2_COLLISION_SHA256,
    }
    result: dict[str, dict[str, str]] = {}
    for key, path in paths.items():
        digest = sha256_file(path)
        result[key] = {"path": path.relative_to(repo_root).as_posix(), "sha256": digest}
        if key in expected and digest != expected[key]:
            raise RuntimeError(f"Immutable input hash mismatch for {key}: {digest} != {expected[key]}")
    constants_text = paths["catalog_default"].read_text(encoding="utf-8")
    if "DEFAULT_MAP_REVISION = 1 as const" not in constants_text:
        raise RuntimeError("Catalog default is not revision 1")
    result["catalog_default"]["assertion"] = "DEFAULT_MAP_REVISION_EQUALS_1"
    return result


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    source_dir = output_root / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    validation_dir = output_root / "validation"
    validation_dir.mkdir(parents=True, exist_ok=True)

    input_before = verify_inputs(repo_root)
    clear_scene()
    materials = make_materials()
    collections = {
        "architecture": make_collection("G5_PRESS_HALL_ARCHITECTURE"),
        "modules": make_collection("G5_PRESS_HALL_MODULAR_ASSETS"),
        "details": make_collection("G5_PRESS_HALL_AUTHORED_DETAILS"),
        "red_fold": make_collection("G5_TRANSITION_RED_FOLD"),
        "paper_drop": make_collection("G5_TRANSITION_PAPER_DROP"),
        "lights": make_collection("G5_REVIEW_LIGHTING"),
        "cameras": make_collection("G5_REVIEW_CAMERAS"),
    }

    build_architecture(collections, materials)
    build_press_modules(collections, materials)
    build_red_fold_transition(collections["red_fold"], collections["details"], materials)
    build_paper_drop_transition(collections["paper_drop"], collections["details"], materials)
    cameras = configure_stage(collections, materials)

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

    source_blend = source_dir / "inkfall_foundry_press_hall_final_art_v1.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), check_existing=False)
    render_results = render_views(output_root, cameras)
    # Save again so the source reopens in the original color-material state.
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), check_existing=False)
    export_collections = [
        collections["architecture"],
        collections["modules"],
        collections["details"],
        collections["red_fold"],
        collections["paper_drop"],
    ]
    export_glb = export_render_only(output_root, export_collections)

    envelope_results = validate_replacement_envelopes()
    input_after = verify_inputs(repo_root)
    immutable_unchanged = input_before == input_after
    material_slots_present = sorted({str(mat.get("kyx_material_slot")) for mat in bpy.data.materials if mat.get("kyx_material_slot")})
    required_material_slots_present = all(slot in material_slots_present for slot in REQUIRED_MATERIAL_SLOTS)
    collision_objects = [obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None}]
    mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    authored_module_ids = sorted({str(obj.get("kyx_module_id")) for obj in mesh_objects if obj.get("kyx_module_id")})
    transition_ids = sorted({str(obj.get("kyx_transition_id")) for obj in mesh_objects if obj.get("kyx_transition_id")})
    all_envelopes_pass = all(item["status"] == "PASS" for item in envelope_results)

    output_artifacts = {
        "sourceBlend": {"path": source_blend.relative_to(repo_root).as_posix(), "sha256": sha256_file(source_blend), "bytes": source_blend.stat().st_size},
        "renderGlb": {"path": export_glb.relative_to(repo_root).as_posix(), "sha256": sha256_file(export_glb), "bytes": export_glb.stat().st_size},
        "renders": [
            {
                "view": item["view"],
                "mode": item["mode"],
                "path": item["path"].relative_to(repo_root).as_posix(),
                "sha256": sha256_file(item["path"]),
                "bytes": item["path"].stat().st_size,
                "resolution": [1600, 900],
            }
            for item in render_results
        ],
    }
    checks = {
        "immutableP67InputsUnchanged": immutable_unchanged,
        "catalogDefaultRevisionStill1": input_after["catalog_default"].get("assertion") == "DEFAULT_MAP_REVISION_EQUALS_1",
        "authorityCollisionObjectsAbsent": len(collision_objects) == 0,
        "replacementEnvelopesContained": all_envelopes_pass,
        "allSevenSemanticMaterialSlotsPresent": required_material_slots_present,
        "pressHallAndTwoTransitionsAuthored": set(transition_ids) == {"paper_drop", "red_fold"},
        "requiredReviewViewsRendered": len(render_results) == 7,
    }
    status = "BOUNDED_PRESS_HALL_ART_BUILD_PASS" if all(checks.values()) else "BOUNDED_PRESS_HALL_ART_BUILD_FAIL"
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_final_art_build_report",
        "status": status,
        "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION, "blenderVersion": bpy.app.version_string},
        "scope": SCOPE,
        "binding": {"mapId": "inkfall_foundry", "grayboxRevision": 2, "grayboxLockRevision": 1, "catalogDefaultRevision": 1},
        "room": "press_hall",
        "connectedTransitions": ["red_fold", "paper_drop"],
        "checks": checks,
        "counts": {
            "meshObjects": len(mesh_objects),
            "materials": len(bpy.data.materials),
            "authoredModuleIds": len(authored_module_ids),
            "transitionIds": len(transition_ids),
            "replacementEnvelopes": len(envelope_results),
            "renderViews": len(render_results),
        },
        "authoredModuleIds": authored_module_ids,
        "materialSlots": material_slots_present,
        "replacementEnvelopeValidation": envelope_results,
        "immutableInputsBefore": input_before,
        "immutableInputsAfter": input_after,
        "collisionObjects": collision_objects,
        "artifacts": output_artifacts,
        "nonClaims": [
            "G5_NOT_PASSED",
            "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
            "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
            "PERFORMANCE_NOT_MEASURED",
            "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE",
            "PRODUCT_INTEGRATION_NOT_COMPLETE",
            "REVISION_2_NOT_DEFAULT_OR_SHIPPING",
            "DEPLOYMENT_NOT_AUTHORIZED",
        ],
    }
    stable_json(validation_dir / "press-hall-final-art-v1-build-report.json", report)
    if status != "BOUNDED_PRESS_HALL_ART_BUILD_PASS":
        raise RuntimeError(f"Press Hall build validation failed: {checks}")
    print("G5_PRESS_HALL_RESULT=" + json.dumps({"status": status, "report": str(validation_dir / "press-hall-final-art-v1-build-report.json")}, sort_keys=True))


if __name__ == "__main__":
    main()
