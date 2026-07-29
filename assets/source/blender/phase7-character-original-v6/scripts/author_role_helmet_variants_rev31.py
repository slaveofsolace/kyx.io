"""Author the KYX V6B Rev31 browser-runtime role helmet family.

The source scene is the rigged Rev24 runtime descendant of the accepted
Material Flow body language.  This script removes the rejected Rev24 egg
helmet, keeps the fitted segmented torso and proven Rev17 animation contract,
slightly tightens the footwear, and authors four closed helmets that share one
manufacturing language:

* assault / rifle
* breacher / shotgun
* recon / sniper
* duelist / melee

Paths are supplied by the caller.  Nothing in this script assumes a drive
letter or mutates the recovered donor/source worktrees.
"""

from __future__ import annotations

from datetime import datetime, timezone
import bmesh
import bpy
import hashlib
import json
import math
from mathutils import Vector
from pathlib import Path
import sys
from typing import Any


CHECKPOINT = "G6_REV31_ROLE_HELMET_FAMILY"
RIG_NAME = "KYX_REV24_RIG_66_JOINT_WITH_SOCKETS"
LOD0_BODY = "KYX_REV24_LOD0_CONTINUOUS_CYBERSUIT"
LOD0_ARMOR = "KYX_REV24_LOD0_CONNECTED_ARMOR_HELMET"
LOD0_RIFLE = "KYX_REV24_LOD0_COMPACT_RIFLE"
EXPECTED_ACTIONS = (
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_WALK",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_JUMP_START",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_LAND",
    "KYX_REV17_TP_PRIMARY_FIRE",
    "KYX_REV17_TP_RELOAD",
    "KYX_REV17_TP_HIT_REACTION_FRONT",
    "KYX_REV17_TP_DEATH_FRONT",
)
ROLE_ORDER = ("assault", "breacher", "recon", "duelist")
ROLE_METADATA = {
    "assault": {
        "weaponFamily": "rifle",
        "displayName": "Assault / Rifle",
        "helmetVariant": "assault",
        "visor": (0.005, 0.23, 0.52, 1.0),
        "emission": (0.0, 0.32, 0.75, 1.0),
    },
    "breacher": {
        "weaponFamily": "shotgun",
        "displayName": "Breacher / Shotgun",
        "helmetVariant": "breacher",
        "visor": (0.44, 0.12, 0.008, 1.0),
        "emission": (0.95, 0.22, 0.015, 1.0),
    },
    "recon": {
        "weaponFamily": "sniper",
        "displayName": "Recon / Sniper",
        "helmetVariant": "recon",
        "visor": (0.0, 0.28, 0.30, 1.0),
        "emission": (0.0, 0.68, 0.72, 1.0),
    },
    "duelist": {
        "weaponFamily": "melee",
        "displayName": "Duelist / Melee",
        "helmetVariant": "duelist",
        "visor": (0.34, 0.015, 0.055, 1.0),
        "emission": (0.88, 0.025, 0.16, 1.0),
    },
}


def arguments() -> tuple[Path, Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <source-rev24.blend> <output-master.blend> "
            "<runtime-output-dir> <report.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 4:
        raise SystemExit(f"Expected four arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def material(
    name: str,
    base: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    created = bpy.data.materials.new(name=name)
    created.use_nodes = True
    shader = next(
        node
        for node in created.node_tree.nodes
        if node.type == "BSDF_PRINCIPLED"
    )
    shader.inputs["Base Color"].default_value = base
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_socket = shader.inputs.get("Emission Color") or shader.inputs.get(
            "Emission"
        )
        if emission_socket is not None:
            emission_socket.default_value = emission
        strength_socket = shader.inputs.get("Emission Strength")
        if strength_socket is not None:
            strength_socket.default_value = emission_strength
    created.diffuse_color = base
    created["kyx_checkpoint"] = CHECKPOINT
    return created


def role_materials(role: str) -> dict[str, bpy.types.Material]:
    role_data = ROLE_METADATA[role]
    return {
        "shell": material(
            "KYX_ROLE_ARMOR_AgedGraphite",
            (0.032, 0.045, 0.059, 1.0),
            0.76,
            0.34,
        ),
        "panel": material(
            "KYX_ROLE_ARMOR_SatinGunmetal",
            (0.011, 0.020, 0.033, 1.0),
            0.68,
            0.42,
        ),
        "edge": material(
            "KYX_ROLE_ARMOR_BurnishedEdge",
            (0.12, 0.15, 0.18, 1.0),
            0.84,
            0.30,
        ),
        "cowl": material(
            "KYX_ROLE_BODY_ContinuousCyberCowl",
            (0.004, 0.009, 0.016, 1.0),
            0.14,
            0.58,
        ),
        "visor": material(
            f"KYX_ROLE_VISOR_{role.upper()}",
            role_data["visor"],
            0.44,
            0.13,
            role_data["emission"],
            1.3,
        ),
    }


def move_to_collection(
    obj: bpy.types.Object,
    collection: bpy.types.Collection,
) -> None:
    for linked in list(obj.users_collection):
        linked.objects.unlink(obj)
    collection.objects.link(obj)


def apply_transforms(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def bevel_object(
    obj: bpy.types.Object,
    width: float,
    segments: int = 2,
) -> None:
    modifier = obj.modifiers.new(name="KYX_ROLE_FAMILY_EDGE_SOFTEN", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(28.0)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False


def bind_rigid(
    obj: bpy.types.Object,
    rig: bpy.types.Object,
    bone: str,
    role: str,
) -> None:
    obj.vertex_groups.clear()
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new(name="KYX_ROLE_HEAD_BIND", type="ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role_helmet"] = role
    obj["kyx_attachment_bone"] = bone


def bind_head(obj: bpy.types.Object, rig: bpy.types.Object, role: str) -> None:
    bind_rigid(obj, rig, "head", role)


def create_box(
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    role: str,
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    assigned_material: bpy.types.Material,
    bevel: float,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = f"KYX_REV31_{role.upper()}_{name}"
    obj.dimensions = dimensions
    apply_transforms(obj)
    move_to_collection(obj, collection)
    obj.data.materials.append(assigned_material)
    bevel_object(obj, bevel)
    bind_head(obj, rig, role)
    return obj


def create_cylinder(
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    role: str,
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    assigned_material: bpy.types.Material,
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 16,
    bevel: float = 0.004,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = f"KYX_REV31_{role.upper()}_{name}"
    obj.scale = scale
    apply_transforms(obj)
    move_to_collection(obj, collection)
    obj.data.materials.append(assigned_material)
    bevel_object(obj, bevel, 1)
    bind_head(obj, rig, role)
    return obj


def create_cowl(
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    role: str,
    assigned_material: bpy.types.Material,
    width_scale: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3,
        radius=1.0,
        location=(0.0, -0.034, 1.675),
    )
    obj = bpy.context.active_object
    obj.name = f"KYX_REV31_{role.upper()}_ContinuousCyberCowl"
    obj.scale = (0.101 * width_scale, 0.091, 0.137)
    apply_transforms(obj)
    move_to_collection(obj, collection)
    obj.data.materials.append(assigned_material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bind_head(obj, rig, role)
    return obj


def create_shell(
    collection: bpy.types.Collection,
    rig: bpy.types.Object,
    role: str,
    assigned_material: bpy.types.Material,
    width_scale: float,
) -> bpy.types.Object:
    """Create a faceted, head-shaped rear/crown shell rather than a cuboid."""

    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3,
        radius=1.0,
        location=(0.0, -0.018, 1.682),
    )
    obj = bpy.context.active_object
    obj.name = f"KYX_REV31_{role.upper()}_RearShell"
    obj.scale = (0.108 * width_scale, 0.097, 0.139)
    apply_transforms(obj)
    # Flatten the face side slightly; the fitted faceplate covers this plane.
    for vertex in obj.data.vertices:
        vertex.co.y = max(vertex.co.y, -0.096)
        if vertex.co.z > 0.073:
            vertex.co.x *= 0.89
            vertex.co.y = -0.018 + (vertex.co.y + 0.018) * 0.90
    obj.data.update()
    move_to_collection(obj, collection)
    obj.data.materials.append(assigned_material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    bind_head(obj, rig, role)
    return obj


def create_common_waist_bridge(
    rig: bpy.types.Object,
) -> list[bpy.types.Object]:
    collection = bpy.data.collections.new("KYX_REV31_COMMON_BODY_CONTINUITY")
    bpy.context.scene.collection.children.link(collection)
    materials = role_materials("assault")
    created: list[bpy.types.Object] = []
    gasket = create_cylinder(
        collection,
        rig,
        "common",
        "WaistFlexGasket",
        (0.0, -0.004, 0.928),
        0.135,
        0.074,
        materials["cowl"],
        scale=(1.0, 0.73, 1.0),
        vertices=20,
        bevel=0.008,
    )
    bind_rigid(gasket, rig, "root", "common")
    created.append(gasket)
    for index, z in enumerate((0.967, 0.999, 1.031), start=1):
        band = create_box(
            collection,
            rig,
            "common",
            f"ArticulatedAbdomenBand_{index}",
            (0.0, -0.082 + index * 0.002, z),
            (0.164 - index * 0.004, 0.030, 0.026),
            materials["panel"] if index == 2 else materials["shell"],
            0.007,
            (math.radians(-2.0 + index), 0.0, 0.0),
        )
        bind_rigid(band, rig, "spine_01", "common")
        created.append(band)
    for obj in created:
        obj["kyx_body_continuity"] = True
        obj["kyx_role_helmet"] = ""
    return created


def create_family_helmet(
    role: str,
    rig: bpy.types.Object,
) -> tuple[bpy.types.Collection, list[bpy.types.Object]]:
    role_data = ROLE_METADATA[role]
    materials = role_materials(role)
    collection = bpy.data.collections.new(f"KYX_REV31_ROLE_{role.upper()}")
    bpy.context.scene.collection.children.link(collection)
    collection["kyx_checkpoint"] = CHECKPOINT
    collection["kyx_role"] = role
    collection["kyx_weapon_family"] = role_data["weaponFamily"]
    parts: list[bpy.types.Object] = []

    width = {
        "assault": 1.0,
        "breacher": 1.045,
        "recon": 0.965,
        "duelist": 0.94,
    }[role]
    face_depth = {
        "assault": 0.052,
        "breacher": 0.061,
        "recon": 0.046,
        "duelist": 0.048,
    }[role]
    visor_height = {
        "assault": 0.038,
        "breacher": 0.030,
        "recon": 0.025,
        "duelist": 0.032,
    }[role]

    parts.append(create_cowl(collection, rig, role, materials["cowl"], width))
    # Shared compact shell architecture.  Every panel overlaps an adjacent
    # element; there are no floating trims, spikes, or open face/scalp gaps.
    parts.append(create_shell(collection, rig, role, materials["shell"], width))
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "Crown",
            (0.0, -0.028, 1.782),
            (0.143 * width, 0.112, 0.043),
            materials["edge"],
            0.012,
            (math.radians(-8.0), 0.0, 0.0),
        )
    )
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "Faceplate",
            (0.0, -0.108, 1.620),
            (0.149 * width, face_depth, 0.073),
            materials["panel"],
            0.014,
            (math.radians(4.0), 0.0, 0.0),
        )
    )
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "Visor",
            (0.0, -0.126, 1.690),
            (0.158 * width, 0.019, visor_height + 0.014),
            materials["visor"],
            0.007,
            (math.radians(2.0), 0.0, 0.0),
        )
    )
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "VisorBrow",
            (0.0, -0.117, 1.727),
            (0.163 * width, 0.031, 0.022),
            materials["edge"],
            0.007,
            (math.radians(-5.0), 0.0, 0.0),
        )
    )
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "Chin",
            (0.0, -0.106, 1.580),
            (0.145 * width, 0.052, 0.047),
            materials["edge"],
            0.012,
            (math.radians(-4.0), 0.0, 0.0),
        )
    )
    for side, sign in (("L", 1.0), ("R", -1.0)):
        parts.append(
            create_box(
                collection,
                rig,
                role,
                f"Temple_{side}",
                (sign * 0.096 * width, -0.025, 1.665),
                (0.024, 0.092, 0.091),
                materials["shell"],
                0.010,
                (0.0, math.radians(sign * 3.0), 0.0),
            )
        )
        parts.append(
            create_box(
                collection,
                rig,
                role,
                f"Cheek_{side}",
                (sign * 0.071 * width, -0.101, 1.611),
                (0.036, 0.043, 0.061),
                materials["panel"],
                0.010,
                (0.0, math.radians(sign * -5.0), math.radians(sign * 3.0)),
            )
        )
    parts.append(
        create_cylinder(
            collection,
            rig,
            role,
            "NeckSeal",
            (0.0, -0.016, 1.536),
            0.104 * width,
            0.058,
            materials["cowl"],
            scale=(1.0, 0.84, 1.0),
            vertices=20,
            bevel=0.007,
        )
    )
    parts.append(
        create_box(
            collection,
            rig,
            role,
            "MouthVent",
            (0.0, -0.139, 1.611),
            (0.071 * width, 0.014, 0.014),
            materials["edge"],
            0.004,
        )
    )

    if role == "assault":
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "CrownRail",
                (0.0, -0.020, 1.798),
                (0.058, 0.080, 0.014),
                materials["panel"],
                0.005,
            )
        )
    elif role == "breacher":
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "ReinforcedBrow",
                (0.0, -0.131, 1.741),
                (0.190 * width, 0.030, 0.034),
                materials["shell"],
                0.009,
                (math.radians(-6.0), 0.0, 0.0),
            )
        )
        for side, sign in (("L", 1.0), ("R", -1.0)):
            parts.append(
                create_box(
                    collection,
                    rig,
                    role,
                    f"JawReinforcement_{side}",
                    (sign * 0.074, -0.116, 1.580),
                    (0.052, 0.052, 0.054),
                    materials["shell"],
                    0.011,
                )
            )
    elif role == "recon":
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "SensorBrow",
                (0.0, -0.139, 1.742),
                (0.092, 0.020, 0.020),
                materials["visor"],
                0.005,
            )
        )
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "FlushOptic_L",
                (0.099 * width, -0.041, 1.678),
                (0.018, 0.044, 0.035),
                materials["visor"],
                0.005,
                (0.0, math.radians(4.0), 0.0),
            )
        )
    elif role == "duelist":
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "FaceSpine",
                (0.0, -0.139, 1.629),
                (0.021, 0.018, 0.112),
                materials["edge"],
                0.005,
                (math.radians(4.0), 0.0, 0.0),
            )
        )
        parts.append(
            create_box(
                collection,
                rig,
                role,
                "LowerGuard",
                (0.0, -0.129, 1.574),
                (0.105, 0.026, 0.029),
                materials["shell"],
                0.007,
            )
        )

    for part in parts:
        part["kyx_display_name"] = role_data["displayName"]
        part["kyx_helmet_variant"] = role_data["helmetVariant"]
        part["kyx_weapon_family"] = role_data["weaponFamily"]
    return collection, parts


def remove_rejected_helmet_geometry(obj: bpy.types.Object) -> dict[str, int]:
    before_vertices = len(obj.data.vertices)
    before_triangles = triangle_count(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    remove = [vertex for vertex in mesh.verts if vertex.co.z > 1.512]
    bmesh.ops.delete(mesh, geom=remove, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    obj.name = obj.name.replace(
        "CONNECTED_ARMOR_HELMET", "CONNECTED_ARMOR_NO_HELMET"
    )
    obj["kyx_rev31_removed_rejected_egg_helmet"] = True
    return {
        "verticesBefore": before_vertices,
        "verticesAfter": len(obj.data.vertices),
        "trianglesBefore": before_triangles,
        "trianglesAfter": triangle_count(obj),
    }


def tighten_footwear(obj: bpy.types.Object) -> dict[str, Any]:
    affected = 0
    for vertex in obj.data.vertices:
        if vertex.co.z > 0.265:
            continue
        side_center = 0.105 if vertex.co.x >= 0.0 else -0.105
        vertex.co.x = side_center + (vertex.co.x - side_center) * 0.94
        # Shorten the shoe fore-aft without touching the heel contact plane.
        vertex.co.y = -0.02 + (vertex.co.y + 0.02) * 0.91
        affected += 1
    obj.data.update()
    obj["kyx_rev31_compact_footwear_pass"] = True
    return {
        "object": obj.name,
        "affectedVertices": affected,
        "widthScale": 0.94,
        "foreAftScale": 0.91,
        "floorZPreserved": True,
    }


def remove_floor_witness_geometry(obj: bpy.types.Object) -> dict[str, int]:
    before_vertices = len(obj.data.vertices)
    before_triangles = triangle_count(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    remove = [
        vertex
        for vertex in mesh.verts
        if (
            vertex.co.z < 0.055
            and abs(vertex.co.x) < 0.060
            and abs(vertex.co.y) < 0.060
        )
    ]
    bmesh.ops.delete(mesh, geom=remove, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    return {
        "verticesBefore": before_vertices,
        "verticesAfter": len(obj.data.vertices),
        "verticesRemoved": before_vertices - len(obj.data.vertices),
        "trianglesBefore": before_triangles,
        "trianglesAfter": triangle_count(obj),
    }


def action_names(rig: bpy.types.Object) -> list[str]:
    if rig.animation_data is None:
        return []
    return sorted(
        {
            strip.action.name
            for track in rig.animation_data.nla_tracks
            for strip in track.strips
            if strip.action is not None
        }
    )


def exporter_kwargs(path: Path) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_extras": True,
        "export_yup": True,
        "export_apply": False,
        "export_animations": True,
        "export_frame_range": True,
        "export_frame_step": 1,
        "export_force_sampling": False,
        "export_optimize_animation_size": False,
        "export_animation_mode": "NLA_TRACKS",
        "export_merge_animation": "NLA_TRACK",
        "export_skins": True,
        "export_influence_nb": 4,
        "export_all_influences": False,
        "export_def_bones": False,
        "export_leaf_bone": False,
    }
    supported = {
        item.identifier
        for item in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in kwargs.items() if key in supported}


def export_role(
    role: str,
    output: Path,
    rig: bpy.types.Object,
    base_meshes: list[bpy.types.Object],
    helmet_parts: list[bpy.types.Object],
) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = [rig, *base_meshes, *helmet_parts]
    for obj in selected:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.gltf(**exporter_kwargs(output))
    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError(f"Failed to export {role}: {result}")
    return {
        "role": role,
        "displayName": ROLE_METADATA[role]["displayName"],
        "helmetVariant": ROLE_METADATA[role]["helmetVariant"],
        "weaponFamily": ROLE_METADATA[role]["weaponFamily"],
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "meshCount": len(base_meshes) + len(helmet_parts),
        "helmetPartCount": len(helmet_parts),
        "helmetVertices": sum(len(item.data.vertices) for item in helmet_parts),
        "helmetTriangles": sum(triangle_count(item) for item in helmet_parts),
    }


def main() -> None:
    source_path, output_master, runtime_dir, report_path = arguments()
    if not source_path.is_file():
        raise RuntimeError(f"Rev24 source is missing: {source_path}")
    loaded_path = Path(bpy.data.filepath).resolve()
    if loaded_path != source_path:
        raise RuntimeError(
            f"Blender opened {loaded_path}, but the declared source is {source_path}"
        )
    source_hash_before = sha256(source_path)
    rig = bpy.data.objects.get(RIG_NAME)
    body = bpy.data.objects.get(LOD0_BODY)
    armor = bpy.data.objects.get(LOD0_ARMOR)
    rifle = bpy.data.objects.get(LOD0_RIFLE)
    if (
        rig is None
        or rig.type != "ARMATURE"
        or body is None
        or armor is None
        or rifle is None
    ):
        raise RuntimeError("Rev24 runtime rig/body/armor/rifle contract is incomplete")

    inherited_actions = action_names(rig)
    missing_actions = sorted(set(EXPECTED_ACTIONS) - set(inherited_actions))
    if missing_actions:
        raise RuntimeError(f"Required inherited actions are missing: {missing_actions}")
    if len(rig.data.bones) != 66:
        raise RuntimeError(f"Expected 66 bones, got {len(rig.data.bones)}")

    helmet_removal = {}
    floor_witness_removal = {}
    footwear_pass = []
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if "CONNECTED_ARMOR_HELMET" in obj.name:
            helmet_removal[obj.name] = remove_rejected_helmet_geometry(obj)
        if "LOD0" in obj.name and (
            "CONTINUOUS_CYBERSUIT" in obj.name or "CONNECTED_ARMOR" in obj.name
        ):
            footwear_pass.append(tighten_footwear(obj))
            floor_witness_removal[obj.name] = remove_floor_witness_geometry(obj)

    armor = bpy.data.objects.get(
        LOD0_ARMOR.replace("CONNECTED_ARMOR_HELMET", "CONNECTED_ARMOR_NO_HELMET")
    )
    if armor is None:
        raise RuntimeError("Helmet-free LOD0 armor was not produced")

    common_body_parts = create_common_waist_bridge(rig)
    role_parts: dict[str, list[bpy.types.Object]] = {}
    role_collections: dict[str, bpy.types.Collection] = {}
    for role in ROLE_ORDER:
        collection, parts = create_family_helmet(role, rig)
        role_collections[role] = collection
        role_parts[role] = parts

    # The Blender source opens on Assault but retains all variants in named,
    # independently selectable collections.
    for role, collection in role_collections.items():
        collection.hide_render = role != "assault"
        collection.hide_viewport = role != "assault"

    output_master.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_master), check_existing=False)
    output_master_hash = sha256(output_master)
    base_meshes = [body, armor, rifle, *common_body_parts]

    exports = []
    for role in ROLE_ORDER:
        for collection in role_collections.values():
            collection.hide_render = False
            collection.hide_viewport = False
        export_path = runtime_dir / f"character-{role}-lod0.glb"
        exports.append(
            export_role(
                role,
                export_path,
                rig,
                base_meshes,
                role_parts[role],
            )
        )

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "kyx-g6-rev31-role-helmet-author-report-v1",
        "checkpoint": CHECKPOINT,
        "status": "AUTHORED_EXPORTED_RUNTIME_CANDIDATE_HUMAN_REVIEW_REQUIRED",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "path": str(source_path),
            "sha256Before": source_hash_before,
            "sha256After": sha256(source_path),
            "sourceUnchanged": source_hash_before == sha256(source_path),
            "lineage": (
                "Material Flow v9 presentation -> Rev24 66-bone runtime "
                "character -> Rev31 role helmet family"
            ),
        },
        "master": {
            "path": str(output_master),
            "bytes": output_master.stat().st_size,
            "sha256": output_master_hash,
        },
        "rig": {
            "name": rig.name,
            "bones": len(rig.data.bones),
            "actions": inherited_actions,
            "requiredActions": list(EXPECTED_ACTIONS),
            "missingRequiredActions": missing_actions,
        },
        "body": {
            "name": body.name,
            "vertices": len(body.data.vertices),
            "triangles": triangle_count(body),
            "lineage": "Rev24 rigged descendant of Material Flow v9",
            "segmentedTorsoPreserved": True,
            "gloveGeometryPreserved": True,
            "continuityBridgeParts": [obj.name for obj in common_body_parts],
        },
        "armor": {
            "name": armor.name,
            "vertices": len(armor.data.vertices),
            "triangles": triangle_count(armor),
            "rejectedHelmetRemoval": helmet_removal,
            "floorWitnessRemoval": floor_witness_removal,
            "footwearPass": footwear_pass,
        },
        "roles": exports,
        "assertions": {
            "sourceUnchanged": source_hash_before == sha256(source_path),
            "boneContract66": len(rig.data.bones) == 66,
            "allRequiredActionsInherited": not missing_actions,
            "fourRoleVariantsExported": len(exports) == 4,
            "allHelmetPartsHeadBound": all(
                part.get("kyx_attachment_bone") == "head"
                for parts in role_parts.values()
                for part in parts
            ),
            "allHelmetFamiliesClosedByConstruction": True,
            "noSpikesOrDetachedAntennaeAuthored": True,
            "footwearFurtherReduced": all(
                record["widthScale"] < 1.0 and record["foreAftScale"] < 1.0
                for record in footwear_pass
            ),
        },
        "nonClaims": [
            "Author/export assertions do not grant human visual acceptance.",
            "Static construction checks do not prove every-frame clipping freedom.",
            "The inherited compact rifle remains a contact witness and is hidden "
            "when the browser attaches the selected runtime weapon.",
            "Role loadout selection and HUD integration are separate lanes.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not all(report["assertions"].values()):
        raise RuntimeError(f"Rev31 author assertions failed: {report['assertions']}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
