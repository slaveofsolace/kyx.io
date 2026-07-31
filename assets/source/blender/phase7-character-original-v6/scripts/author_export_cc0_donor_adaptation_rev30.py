from __future__ import annotations

import bpy
import bmesh
import hashlib
import json
import math
import os
import struct
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree


SCRIPT_PATH = Path(__file__).resolve()
WORKTREE = SCRIPT_PATH.parents[5]
SOURCE_MASTER = (
    WORKTREE
    / "assets"
    / "source"
    / "blender"
    / "phase7-character-original-v6"
    / "model"
    / "v6c-character-rev17"
    / "kyx-v6c-character-rev17-master.blend"
)
def required_external_path(environment_name: str) -> Path:
    value = os.environ.get(environment_name, "").strip()
    if not value:
        raise RuntimeError(
            f"{environment_name} must point to the audited external donor input"
        )
    return Path(value).expanduser().resolve()


DONOR_ROOT = required_external_path("KYX_REV30_DONOR_ROOT")
DONOR_BLEND = DONOR_ROOT / "Mesh.blend"
DONOR_ARCHIVE = required_external_path("KYX_REV30_DONOR_ARCHIVE")

CANDIDATE_ID = "g6-rev30-cc0-donor"
MODEL_DIR = (
    WORKTREE
    / "assets"
    / "source"
    / "blender"
    / "phase7-character-original-v6"
    / "model"
    / "v6c-character-rev30-cc0-donor"
)
TEXTURE_DIR = MODEL_DIR / "textures"
MASTER_BLEND = MODEL_DIR / "kyx-v6c-character-rev30-cc0-donor-master.blend"
PUBLIC_DIR = WORKTREE / "public" / "candidates" / CANDIDATE_ID
GLB_PATH = PUBLIC_DIR / "character-lod0.glb"
EVIDENCE_DIR = WORKTREE / "evidence" / "2026-07-28" / CANDIDATE_ID
REPORT_PATH = EVIDENCE_DIR / "author-export-report.json"
NOTICE_PATH = MODEL_DIR / "DONOR_NOTICE.md"
MANIFEST_PATH = WORKTREE / "assets" / "manifests" / f"{CANDIDATE_ID}-character-lod0.asset.json"

RIG_NAME = "KYX_REV17_RIG_66_JOINT_WITH_SOCKETS"
RIFLE_NAME = "KYX_REV17_LOD0_COMPACT_RIFLE"
BODY_NAME = "KYX_REV30_CC0_DONOR_BODY_WITH_LEFT_HAND"
HAND_NAME = "KYX_REV30_CC0_DONOR_RIGHT_HAND"
HEAD_NAME = "KYX_REV30_CC0_DONOR_HEAD2_BROAD_VISOR"

EXPECTED_ACTIONS = {
    "KYX_REV17_FP_AIRBORNE": (1.0, 25.0),
    "KYX_REV17_FP_FIRE": (1.0, 12.0),
    "KYX_REV17_FP_IDLE": (1.0, 49.0),
    "KYX_REV17_FP_LAND": (1.0, 16.0),
    "KYX_REV17_FP_RELOAD": (1.0, 49.0),
    "KYX_REV17_FP_SPRINT": (1.0, 19.0),
    "KYX_REV17_TP_AIRBORNE_LOOP": (1.0, 25.0),
    "KYX_REV17_TP_DEATH_FRONT": (1.0, 60.0),
    "KYX_REV17_TP_HIT_REACTION_FRONT": (1.0, 20.0),
    "KYX_REV17_TP_IDLE": (1.0, 49.0),
    "KYX_REV17_TP_JUMP_START": (1.0, 14.0),
    "KYX_REV17_TP_LAND": (1.0, 16.0),
    "KYX_REV17_TP_PRIMARY_FIRE": (1.0, 12.0),
    "KYX_REV17_TP_RELOAD": (1.0, 49.0),
    "KYX_REV17_TP_RUN": (1.0, 19.0),
    "KYX_REV17_TP_WALK": (1.0, 25.0),
}

SOCKET_NAMES = (
    "socket_hand_r",
    "socket_weapon_r",
    "socket_muzzle",
    "socket_nozzle",
    "socket_casing",
)

DONOR_PROVENANCE = {
    "sourceUrl": "https://opengameart.org/content/sci-fi-soldier",
    "author": "Irondust",
    "license": "CC0-1.0",
    "archiveBytes": 59609012,
    "archiveSha256": "4a91f4ae01117656c9a5a8fc71930f852b2c4d3e94f3f9a2c88109ad931e0db4",
    "objectsUsed": ["Body", "HandSimple", "Head2"],
    "objectsExplicitlyOmitted": ["Cannon", "Head1", "Head3"],
    "texturesUsed": [
        "FederalSoldierSkin_NormalMap.png",
        "FederalSoldierSkin_Occlusion.png",
        "FederalSoldierSkin_Specular.tga",
    ],
    "texturesExplicitlyNotUsed": [
        "FederalSoldierSkin_Albedo.tga",
        "FederalSoldierSkin_Emission.png",
    ],
    "sourceArchiveCommitted": False,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def matrix_record(matrix: Matrix) -> list[list[float]]:
    return [[round(float(value), 8) for value in row] for row in matrix]


def matrix_record_max_delta(
    left: list[list[float]], right: list[list[float]]
) -> float:
    return max(
        abs(float(left[row][column]) - float(right[row][column]))
        for row in range(4)
        for column in range(4)
    )


def bounds(objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return {
        "min": [min(point[index] for point in points) for index in range(3)],
        "max": [max(point[index] for point in points) for index in range(3)],
    }


def evaluated_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def action_contract() -> dict[str, list[float]]:
    return {
        action.name: [float(action.frame_range[0]), float(action.frame_range[1])]
        for action in sorted(bpy.data.actions, key=lambda item: item.name)
        if action.name in EXPECTED_ACTIONS
    }


def assert_action_contract(contract: dict[str, list[float]], stage: str) -> None:
    expected = {name: list(frame_range) for name, frame_range in EXPECTED_ACTIONS.items()}
    if contract != expected:
        raise RuntimeError(f"{stage}: action contract changed: {contract}")


def socket_contract(rig: bpy.types.Object) -> dict[str, list[list[float]]]:
    return {
        name: matrix_record(rig.data.bones[name].matrix_local)
        for name in SOCKET_NAMES
    }


def assert_archive() -> None:
    if DONOR_ARCHIVE.stat().st_size != DONOR_PROVENANCE["archiveBytes"]:
        raise RuntimeError("CC0 donor archive byte size changed")
    if sha256(DONOR_ARCHIVE) != DONOR_PROVENANCE["archiveSha256"]:
        raise RuntimeError("CC0 donor archive hash changed")


def append_donor_objects() -> dict[str, bpy.types.Object]:
    requested = ("Body", "HandSimple", "Head2", "Head3", "metarig")
    with bpy.data.libraries.load(str(DONOR_BLEND), link=False) as (available, incoming):
        missing = sorted(set(requested) - set(available.objects))
        if missing:
            raise RuntimeError(f"Donor objects missing: {missing}")
        incoming.objects = list(requested)
    appended = {}
    for obj in incoming.objects:
        if obj is None:
            continue
        bpy.context.scene.collection.objects.link(obj)
        appended[obj.name] = obj
    if set(appended) != set(requested):
        raise RuntimeError(f"Unexpected donor append result: {sorted(appended)}")
    bpy.context.view_layer.update()
    return appended


def save_derived_texture(source_name: str, output_name: str) -> bpy.types.Image:
    source = bpy.data.images.load(str(DONOR_ROOT / source_name), check_existing=False)
    source.scale(2048, 2048)
    output = TEXTURE_DIR / output_name
    source.filepath_raw = str(output)
    source.file_format = "PNG"
    source.save()
    source.name = output_name
    source.filepath = str(output)
    source.colorspace_settings.name = "Non-Color"
    return source


def mapped_texture_material(
    name: str,
    base_color: tuple[float, float, float, float],
    metallic: float,
    roughness_low: float,
    roughness_high: float,
    normal_image: bpy.types.Image,
    occlusion_image: bpy.types.Image,
    specular_image: bpy.types.Image,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base_color
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = base_color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = (roughness_low + roughness_high) * 0.5
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    occlusion = nodes.new("ShaderNodeTexImage")
    occlusion.image = occlusion_image
    occlusion.interpolation = "Linear"
    occlusion_group = bpy.data.node_groups.get("glTF Material Output")
    if occlusion_group is None:
        occlusion_group = bpy.data.node_groups.new(
            "glTF Material Output", "ShaderNodeTree"
        )
        occlusion_group.interface.new_socket(
            name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat"
        )
    occlusion_output = nodes.new("ShaderNodeGroup")
    occlusion_output.node_tree = occlusion_group
    links.new(occlusion.outputs["Color"], occlusion_output.inputs["Occlusion"])

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.image = normal_image
    normal_texture.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.62
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

    specular = nodes.new("ShaderNodeTexImage")
    specular.image = specular_image
    specular.interpolation = "Linear"
    if "Specular IOR Level" in shader.inputs:
        links.new(specular.outputs["Color"], shader.inputs["Specular IOR Level"])
    return material


def visor_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (0.006, 0.075, 0.12, 1.0)
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.006, 0.075, 0.12, 1.0)
    shader.inputs["Metallic"].default_value = 0.28
    shader.inputs["Roughness"].default_value = 0.14
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.38
        shader.inputs["Coat Roughness"].default_value = 0.08
    if "Emission Color" in shader.inputs:
        shader.inputs["Emission Color"].default_value = (0.0, 0.19, 0.31, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.55
    elif "Emission" in shader.inputs:
        shader.inputs["Emission"].default_value = (0.0, 0.19, 0.31, 1.0)
    return material


def clean_knee_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (0.012, 0.035, 0.055, 1.0)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.012, 0.035, 0.055, 1.0)
    shader.inputs["Metallic"].default_value = 0.5
    shader.inputs["Roughness"].default_value = 0.24
    return material


def group_mappings(source_name: str) -> list[tuple[str, float, str, tuple[float, float, float]]]:
    if source_name == "hips":
        return [("spine_01", 1.0, "hips", (0.88, 1.0, 0.88))]
    if source_name == "spine":
        return [("spine_02", 1.0, "spine", (0.88, 1.0, 0.88))]
    if source_name == "chest":
        return [("chest", 1.0, "chest", (0.88, 1.0, 0.88))]
    if source_name in {"neck", "head"}:
        return [(source_name, 1.0, source_name, (0.93, 0.97, 0.93))]
    for side in ("L", "R"):
        if source_name == f"shoulder.{side}":
            return [(f"clavicle.{side}", 1.0, source_name, (0.89, 0.97, 0.89))]
        if source_name == f"upper_arm.{side}":
            return [(f"upper_arm.{side}", 1.0, source_name, (0.89, 0.96, 0.89))]
        if source_name == f"forearm.{side}":
            return [(f"forearm.{side}", 1.0, source_name, (0.88, 0.96, 0.88))]
        if source_name == f"hand.{side}":
            return [(f"wrist.{side}", 1.0, source_name, (0.9, 0.95, 0.9))]
        if source_name.startswith("palm.") and source_name.endswith(f".{side}"):
            return [(f"palm.{side}", 1.0, source_name, (0.9, 0.95, 0.9))]
        finger_prefixes = {
            "f_index": "index",
            "f_middle": "middle",
            "f_ring": "ring",
            "f_pinky": "pinky",
            "thumb": "thumb",
        }
        for donor_prefix, target_prefix in finger_prefixes.items():
            if source_name.startswith(f"{donor_prefix}.") and source_name.endswith(f".{side}"):
                segment = source_name.split(".")[1]
                return [
                    (
                        f"{target_prefix}_{segment}.{side}",
                        1.0,
                        source_name,
                        (0.91, 0.96, 0.91),
                    )
                ]
        if source_name == f"thigh.{side}":
            return [
                (
                    f"thigh_anchor.{side}",
                    1.0,
                    source_name,
                    (0.91, 0.98, 0.91),
                )
            ]
        if source_name == f"shin.{side}":
            return [
                (
                    f"shin_anchor.{side}",
                    1.0,
                    source_name,
                    (0.9, 0.98, 0.9),
                )
            ]
        if source_name in {f"foot.{side}", f"toe.{side}", f"heel.{side}", f"heel.02.{side}"}:
            return [
                (
                    f"foot_anchor.{side}",
                    1.0,
                    f"foot.{side}",
                    (0.86, 0.9, 0.86),
                )
            ]
    raise RuntimeError(f"No target mapping for donor group {source_name}")


def retarget_object(
    source: bpy.types.Object,
    source_matrix_world: Matrix,
    donor_rig: bpy.types.Object,
    target_rig: bpy.types.Object,
    name: str,
) -> bpy.types.Object:
    mesh = source.data.copy()
    mesh.name = f"{name}_MESH"
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = target_rig.matrix_world.copy()

    group_names = {group.index: group.name for group in source.vertex_groups}
    target_weights: list[dict[str, float]] = []
    donor_from_source = donor_rig.matrix_world.inverted() @ source_matrix_world
    target_bones = target_rig.data.bones
    donor_bones = donor_rig.data.bones

    transform_cache: dict[
        tuple[str, str, tuple[float, float, float]], Matrix
    ] = {}
    for vertex in source.data.vertices:
        donor_position = donor_from_source @ vertex.co
        weighted_position = Vector((0.0, 0.0, 0.0))
        accumulated = 0.0
        weights: dict[str, float] = {}
        foot_drop_weight = 0.0
        for membership in vertex.groups:
            source_group = group_names[membership.group]
            if source_group.startswith(("foot.", "toe.", "heel.")):
                foot_drop_weight += float(membership.weight)
            for target_name, factor, source_reference, local_scale in group_mappings(source_group):
                if target_name not in target_bones:
                    raise RuntimeError(f"Target bone missing: {target_name}")
                if source_reference not in donor_bones:
                    raise RuntimeError(f"Donor reference bone missing: {source_reference}")
                weight = float(membership.weight) * factor
                key = (target_name, source_reference, local_scale)
                transform = transform_cache.get(key)
                if transform is None:
                    fitted_scale = list(local_scale)
                    if source_reference.startswith(("thigh.", "shin.")):
                        fitted_scale[1] = (
                            target_bones[target_name].length
                            / donor_bones[source_reference].length
                        )
                    scale = Matrix.Diagonal((*fitted_scale, 1.0))
                    transform = (
                        target_bones[target_name].matrix_local
                        @ scale
                        @ donor_bones[source_reference].matrix_local.inverted()
                    )
                    transform_cache[key] = transform
                weighted_position += (transform @ donor_position) * weight
                accumulated += weight
                weights[target_name] = weights.get(target_name, 0.0) + weight
        if accumulated <= 1e-8:
            raise RuntimeError(f"{source.name} vertex {vertex.index} has no mapped weight")
        fitted_position = weighted_position / accumulated
        fitted_position.z -= 0.04 * min(1.0, foot_drop_weight)
        mesh.vertices[vertex.index].co = fitted_position
        normalized = {
            target_name: weight / accumulated for target_name, weight in weights.items()
        }
        strongest = sorted(normalized.items(), key=lambda item: item[1], reverse=True)[:4]
        strongest_total = sum(weight for _, weight in strongest)
        target_weights.append(
            {
                target_name: weight / strongest_total
                for target_name, weight in strongest
                if weight > 1e-8
            }
        )

    all_target_groups = sorted({name for weights in target_weights for name in weights})
    created_groups = {name: result.vertex_groups.new(name=name) for name in all_target_groups}
    for vertex_index, weights in enumerate(target_weights):
        for target_name, weight in weights.items():
            if weight > 1e-6:
                created_groups[target_name].add([vertex_index], weight, "REPLACE")

    result.parent = target_rig
    result.matrix_parent_inverse = target_rig.matrix_world.inverted()
    armature = result.modifiers.new("KYX_REV30_REV17_ARMATURE", "ARMATURE")
    armature.object = target_rig
    for polygon in result.data.polygons:
        polygon.use_smooth = True
    result["kyx_candidate"] = CANDIDATE_ID
    result["kyx_donor_source_object"] = source.name
    result["kyx_donor_license"] = "CC0-1.0"
    return result


def maximum_polygon_weight(
    source: bpy.types.Object,
    polygon: bpy.types.MeshPolygon,
    match,
) -> float:
    maximum = 0.0
    for vertex_index in polygon.vertices:
        vertex = source.data.vertices[vertex_index]
        for membership in vertex.groups:
            group_name = source.vertex_groups[membership.group].name
            if match(group_name):
                maximum = max(maximum, float(membership.weight))
    return maximum


def assign_body_materials(
    source: bpy.types.Object,
    result: bpy.types.Object,
    donor_rig: bpy.types.Object,
    source_matrix_world: Matrix,
    base: bpy.types.Material,
    accent: bpy.types.Material,
    glove: bpy.types.Material,
    clean_knee: bpy.types.Material,
) -> dict[str, int]:
    result.data.materials.clear()
    for material in (base, accent, glove, clean_knee):
        result.data.materials.append(material)
    donor_from_source = donor_rig.matrix_world.inverted() @ source_matrix_world
    counts = {"base": 0, "accent": 0, "glove": 0, "cleanKnee": 0}
    for source_polygon, polygon in zip(source.data.polygons, result.data.polygons):
        center = sum(
            (source.data.vertices[index].co for index in source_polygon.vertices),
            Vector((0.0, 0.0, 0.0)),
        ) / len(source_polygon.vertices)
        donor_center = donor_from_source @ center
        glove_weight = maximum_polygon_weight(
            source,
            source_polygon,
            lambda name: (
                name.startswith(("hand.", "palm.", "f_index.", "f_middle.", "f_ring.", "f_pinky.", "thumb."))
            ),
        )
        armor_weight = maximum_polygon_weight(
            source,
            source_polygon,
            lambda name: name.startswith(("forearm.", "shin.", "foot.", "toe.", "heel.", "shoulder.")),
        )
        torso_panel = (
            1.19 <= donor_center.z <= 1.57
            and donor_center.y <= 0.025
            and abs(donor_center.x) <= 0.42
        )
        leg_armor = (
            0.35 <= donor_center.z <= 1.03
            and abs(donor_center.x) >= 0.055
        )
        knee_band = (
            0.47 <= donor_center.z <= 0.68
            and abs(donor_center.x) >= 0.055
        )
        if knee_band:
            polygon.material_index = 3
            counts["cleanKnee"] += 1
        elif glove_weight >= 0.32:
            polygon.material_index = 2
            counts["glove"] += 1
        elif armor_weight >= 0.34 or torso_panel or leg_armor:
            polygon.material_index = 1
            counts["accent"] += 1
        else:
            polygon.material_index = 0
            counts["base"] += 1
    return counts


def repair_viewer_right_knee_silhouette(body: bpy.types.Object) -> dict:
    mesh = body.data
    clean_side = [
        vertex
        for vertex in mesh.vertices
        if vertex.co.x < -0.045 and 0.45 <= vertex.co.z <= 0.69
    ]
    if not clean_side:
        raise RuntimeError("No clean viewer-left knee vertices available for symmetry repair")
    tree = KDTree(len(clean_side))
    for vertex in clean_side:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    repaired = 0
    copied_weight_memberships = 0
    maximum_match_distance = 0.0
    groups_by_index = {group.index: group for group in body.vertex_groups}
    groups_by_name = {group.name: group for group in body.vertex_groups}
    for vertex in mesh.vertices:
        if not (vertex.co.x > 0.045 and 0.45 <= vertex.co.z <= 0.69):
            continue
        mirrored_query = Vector((-vertex.co.x, vertex.co.y, vertex.co.z))
        clean_position, clean_index, distance = tree.find(mirrored_query)
        if distance > 0.04:
            continue
        vertex.co = Vector((-clean_position.x, clean_position.y, clean_position.z))
        for group in body.vertex_groups:
            group.remove([vertex.index])
        for membership in mesh.vertices[clean_index].groups:
            clean_group_name = groups_by_index[membership.group].name
            if clean_group_name.endswith(".R"):
                mirrored_group_name = f"{clean_group_name[:-2]}.L"
            elif clean_group_name.endswith(".L"):
                mirrored_group_name = f"{clean_group_name[:-2]}.R"
            else:
                mirrored_group_name = clean_group_name
            groups_by_name[mirrored_group_name].add(
                [vertex.index],
                float(membership.weight),
                "REPLACE",
            )
            copied_weight_memberships += 1
        repaired += 1
        maximum_match_distance = max(maximum_match_distance, float(distance))
    if repaired < 8:
        raise RuntimeError(
            f"Viewer-right knee symmetry repair touched too few vertices: {repaired}"
        )
    mesh.update()
    return {
        "strategy": (
            "fit thigh/shin surfaces to target bone lengths, then mirror the "
            "clean viewer-left knee band positions and side-swapped weights"
        ),
        "repairedVertexCount": repaired,
        "copiedWeightMembershipCount": copied_weight_memberships,
        "maximumPreRepairMirrorDistance": maximum_match_distance,
        "band": {"xMinimum": 0.045, "zMinimum": 0.45, "zMaximum": 0.69},
    }


def assign_hand_material(
    result: bpy.types.Object, glove: bpy.types.Material
) -> dict[str, int]:
    result.data.materials.clear()
    result.data.materials.append(glove)
    for polygon in result.data.polygons:
        polygon.material_index = 0
    return {"glove": len(result.data.polygons)}


def assign_head_materials(
    source: bpy.types.Object,
    result: bpy.types.Object,
    donor_rig: bpy.types.Object,
    source_matrix_world: Matrix,
    base: bpy.types.Material,
    accent: bpy.types.Material,
    visor: bpy.types.Material,
) -> dict[str, int]:
    result.data.materials.clear()
    for material in (base, accent, visor):
        result.data.materials.append(material)
    donor_from_source = donor_rig.matrix_world.inverted() @ source_matrix_world
    counts = {"base": 0, "accent": 0, "visor": 0}
    for source_polygon, polygon in zip(source.data.polygons, result.data.polygons):
        center = sum(
            (source.data.vertices[index].co for index in source_polygon.vertices),
            Vector((0.0, 0.0, 0.0)),
        ) / len(source_polygon.vertices)
        donor_center = donor_from_source @ center
        is_visor = (
            1.835 <= donor_center.z <= 1.93
            and donor_center.y <= -0.03
            and abs(donor_center.x) <= 0.085
        )
        if is_visor:
            polygon.material_index = 2
            counts["visor"] += 1
        elif donor_center.z < 1.84:
            polygon.material_index = 0
            counts["base"] += 1
        else:
            polygon.material_index = 1
            counts["accent"] += 1
    if counts["visor"] < 12:
        raise RuntimeError(f"Broad visor mask too small: {counts}")
    return counts


def exporter_kwargs(path: Path) -> dict:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "KYX.IO Rev30 candidate. CC0 Sci-fi Soldier donor by Irondust: "
            "Body, HandSimple, Head2 geometry and Federal Soldier normal/spec/occlusion detail. "
            "Rev17 KYX rig, sockets, animations, rifle, fit, material treatment and integration."
        ),
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": False,
        "export_materials": "EXPORT",
        "export_attributes": True,
        "export_cameras": False,
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
        "export_lights": False,
    }
    available = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in requested.items() if key in available}


def parse_glb(path: Path) -> dict:
    payload = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", payload, 0)
    if magic != 0x46546C67 or version != 2 or total_length != len(payload):
        raise RuntimeError("Invalid GLB header")
    offset = 12
    document = None
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunk = payload[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\x00"))
    if document is None:
        raise RuntimeError("GLB JSON chunk missing")
    return {
        "sha256": sha256(path),
        "bytes": len(payload),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "primitives": sum(len(mesh.get("primitives", [])) for mesh in document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "skins": len(document.get("skins", [])),
        "joints": max((len(skin.get("joints", [])) for skin in document.get("skins", [])), default=0),
        "animations": [animation.get("name") for animation in document.get("animations", [])],
    }


def write_notice() -> None:
    NOTICE_PATH.write_text(
        """# KYX.IO Rev30 CC0 Donor Notice

This candidate adapts geometry from **Sci-fi Soldier** by **Irondust**, published
under **CC0 1.0** at <https://opengameart.org/content/sci-fi-soldier>.

- Source archive: `Sci-fi-Soldiers-OpenGameArt-CC0.zip`
- Archive size: `59,609,012` bytes
- Archive SHA-256: `4a91f4ae01117656c9a5a8fc71930f852b2c4d3e94f3f9a2c88109ad931e0db4`
- Donor objects used: `Body`, `HandSimple`, `Head2`
- Donor objects omitted: `Cannon`, `Head1`, `Head3`
- Donor textures used as non-color detail only:
  `FederalSoldierSkin_NormalMap.png`,
  `FederalSoldierSkin_Occlusion.png`,
  `FederalSoldierSkin_Specular.tga`
- Donor albedo/emission are not shipped or used. This intentionally removes the
  source yellow insignia and serial-number branding.
- The original 59.6 MB archive remains outside Git.

KYX.IO supplies the Rev17 66-bone rig, all 16 actions, sockets/nozzle, rifle,
rest-pose retarget, fit corrections, charcoal/gunmetal/cyan material treatment,
export integration and evidence.
""",
        encoding="utf-8",
    )


def write_manifest(glb: dict, report: dict) -> None:
    manifest = {
        "schemaVersion": 1,
        "assetId": "g6.rev30.cc0-donor-character-lod0",
        "kind": "character",
        "releaseEligible": False,
        "sourceHash": sha256(MASTER_BLEND),
        "sourceHashKind": "canonical_source",
        "runtime": {
            "uri": "public/candidates/g6-rev30-cc0-donor/character-lod0.glb",
            "hash": glb["sha256"],
            "bytes": glb["bytes"],
        },
        "budgets": {
            "primitives": glb["primitives"],
            "materials": glb["materials"],
            "nodes": glb["nodes"],
            "bones": glb["joints"],
            "clips": len(glb["animations"]),
            "textures": glb["textures"],
            "waiverId": None,
        },
        "validation": {
            "structuralInspector": "kyx_rev30_exact_glb_reimport_v1",
            "structuralStatus": "passed",
            "errors": [],
            "warnings": ["G6_HUMAN_VISUAL_ACCEPTANCE_REQUIRED"],
        },
        "provenance": {
            "status": "verified_cc0_donor",
            "creator": "KYX.IO adaptation of CC0 donor geometry by Irondust",
            "source": DONOR_PROVENANCE["sourceUrl"],
            "license": "CC0-1.0",
            "licenseSnapshot": "assets/source/blender/phase7-character-original-v6/LICENSES/CC0-1.0.txt",
            "attribution": (
                "Sci-fi Soldier by Irondust, CC0. Body, HandSimple and Head2 geometry; "
                "Federal Soldier normal/spec/occlusion detail. KYX Rev17 rig/actions/sockets."
            ),
            "reviewer": "G6 Rev30 donor adaptation audit",
            "notes": "Candidate only; final human visual acceptance required.",
        },
        "disposition": "candidate",
        "evidence": {
            "report": str(REPORT_PATH.relative_to(WORKTREE)).replace("\\", "/"),
            "renders": report["renders"],
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def look_at(obj: bpy.types.Object, point: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def simple_material(
    name: str, color: tuple[float, float, float, float], roughness: float
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return material


def setup_render_scene() -> tuple[bpy.types.Object, bpy.types.Object]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.film_transparent = False

    world = scene.world or bpy.data.worlds.new("KYX_Rev30_RenderWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (
        0.006,
        0.01,
        0.018,
        1.0,
    )
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.2

    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, -0.008))
    ground = bpy.context.object
    ground.name = "KYX_Rev30_RenderGround"
    ground.data.materials.append(
        simple_material("KYX_Rev30_RenderGroundMaterial", (0.025, 0.035, 0.05, 1.0), 0.7)
    )

    for name, location, energy, color, size in (
        ("Key", (-3.4, -4.0, 4.8), 1250.0, (0.86, 0.93, 1.0), 2.4),
        ("Fill", (3.2, -2.0, 2.8), 820.0, (0.46, 0.58, 0.72), 2.1),
        ("Rim", (1.6, 3.2, 3.8), 1100.0, (0.05, 0.55, 0.8), 1.8),
    ):
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.color = color
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        look_at(light, (0.0, 0.0, 1.0))

    camera_data = bpy.data.cameras.new("KYX_Rev30_RenderCamera")
    camera = bpy.data.objects.new("KYX_Rev30_RenderCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.lens = 55
    return camera, ground


def render_view(
    camera: bpy.types.Object,
    filename: str,
    camera_location: tuple[float, float, float],
    target: tuple[float, float, float],
    ortho_scale: float,
) -> str:
    camera.location = camera_location
    camera.data.ortho_scale = ortho_scale
    look_at(camera, target)
    path = EVIDENCE_DIR / filename
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return str(path.relative_to(WORKTREE)).replace("\\", "/")


def exact_glb_reimport_and_render(
    before_bones: list[str],
    before_actions: dict[str, list[float]],
    before_sockets: dict[str, list[list[float]]],
) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB_PATH))
    bpy.context.view_layer.update()

    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError(f"Exact GLB reimport expected one armature, found {len(rigs)}")
    rig = rigs[0]
    imported_bones = [bone.name for bone in rig.data.bones]
    if imported_bones != before_bones:
        raise RuntimeError("Exact GLB reimport changed the 66-bone order/name contract")
    imported_actions = action_contract()
    assert_action_contract(imported_actions, "exact GLB reimport")
    imported_sockets = socket_contract(rig)
    socket_deltas = {
        name: matrix_record_max_delta(imported_sockets[name], before_sockets[name])
        for name in SOCKET_NAMES
    }
    if max(socket_deltas.values()) > 1e-5:
        raise RuntimeError(
            "Exact GLB reimport changed right-hand/socket/nozzle rest matrices: "
            f"{socket_deltas}"
        )

    required_meshes = {BODY_NAME, HAND_NAME, HEAD_NAME, RIFLE_NAME}
    imported_meshes = {obj.name: obj for obj in bpy.data.objects if obj.type == "MESH"}
    missing = sorted(required_meshes - set(imported_meshes))
    if missing:
        raise RuntimeError(f"Exact GLB reimport missing meshes: {missing}")
    if any("Cannon" in name for name in imported_meshes):
        raise RuntimeError("Cannon geometry leaked into exact GLB")

    body = imported_meshes[BODY_NAME]
    hand = imported_meshes[HAND_NAME]
    head = imported_meshes[HEAD_NAME]
    rifle = imported_meshes[RIFLE_NAME]
    character_meshes = [body, hand, head]
    camera, _ = setup_render_scene()

    rig.data.pose_position = "REST"
    if rig.animation_data:
        rig.animation_data.use_nla = False
        rig.animation_data.action = None
        for track in rig.animation_data.nla_tracks:
            track.mute = True
    bpy.context.scene.frame_set(1)
    rifle.hide_render = True
    rifle.hide_viewport = True
    bpy.context.view_layer.update()

    full_body_render = render_view(
        camera,
        "kyx-rev30-cc0-donor-neutral-full-body-three-quarter.png",
        (3.5, -4.8, 1.18),
        (0.0, 0.0, 0.9),
        2.1,
    )
    boots_render = render_view(
        camera,
        "kyx-rev30-cc0-donor-proportioned-boots.png",
        (1.6, -3.2, 0.34),
        (0.0, -0.02, 0.21),
        0.62,
    )
    helmet_render = str(
        (
            EVIDENCE_DIR
            / "kyx-rev30-cc0-donor-helmet-chest.png"
        ).relative_to(WORKTREE)
    ).replace("\\", "/")
    contact_render = str(
        (
            EVIDENCE_DIR
            / "kyx-rev30-cc0-donor-weapon-ready-hands-clearance.png"
        ).relative_to(WORKTREE)
    ).replace("\\", "/")
    for reused_path in (helmet_render, contact_render):
        if not (WORKTREE / reused_path).is_file():
            raise RuntimeError(
                f"Expected accepted prior evidence for limited rerender: {reused_path}"
            )

    renders = [
        full_body_render,
        helmet_render,
        boots_render,
        contact_render,
    ]

    rig.data.pose_position = "POSE"
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.use_nla = False
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    idle = bpy.data.actions.get("KYX_REV17_TP_IDLE")
    if idle is None:
        raise RuntimeError("Imported weapon-ready idle action missing")
    rig.animation_data.action = idle
    bpy.context.scene.frame_start = int(idle.frame_range[0])
    bpy.context.scene.frame_end = int(idle.frame_range[1])
    bpy.context.scene.frame_set(13)
    rifle.hide_render = False
    rifle.hide_viewport = False
    bpy.context.view_layer.update()
    hand_points = [
        rig.matrix_world @ rig.pose.bones[name].head
        for name in ("palm.R", "palm.L", "wrist.R", "wrist.L")
    ]
    hands_center = sum(hand_points, Vector((0.0, 0.0, 0.0))) / len(hand_points)
    rifle_minimum, rifle_maximum = evaluated_bounds([rifle])
    rifle_center = (rifle_minimum + rifle_maximum) * 0.5
    contact_target = hands_center * 0.82 + rifle_center * 0.18
    return {
        "rigName": rig.name,
        "boneCount": len(imported_bones),
        "bones": imported_bones,
        "actions": imported_actions,
        "sockets": imported_sockets,
        "socketMatrixMaxAbsoluteDelta": socket_deltas,
        "meshNames": sorted(required_meshes),
        "cannonMeshCount": sum("Cannon" in name for name in imported_meshes),
        "characterBoundsRest": bounds(character_meshes),
        "weaponReadyFrame": 13,
        "weaponReadyContactTarget": list(contact_target),
        "renders": renders,
        "renderedThisRun": [full_body_render, boots_render],
        "reusedFromPriorAcceptedBatch": [helmet_render, contact_render],
    }


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    assert_archive()

    rig = bpy.data.objects.get(RIG_NAME)
    rifle = bpy.data.objects.get(RIFLE_NAME)
    if rig is None or rig.type != "ARMATURE":
        raise RuntimeError(f"Rev17 rig missing: {RIG_NAME}")
    if rifle is None or rifle.type != "MESH":
        raise RuntimeError(f"Rev17 rifle missing: {RIFLE_NAME}")

    before_bones = [bone.name for bone in rig.data.bones]
    if len(before_bones) != 66:
        raise RuntimeError(f"Expected 66 Rev17 bones, found {len(before_bones)}")
    before_actions = action_contract()
    assert_action_contract(before_actions, "source master")
    before_sockets = socket_contract(rig)
    before_rig_matrix = matrix_record(rig.matrix_world)

    donor_objects = append_donor_objects()
    donor_rig = donor_objects["metarig"]
    if donor_rig.type != "ARMATURE" or len(donor_rig.data.bones) != 63:
        raise RuntimeError("Expected the donor 63-bone armature")
    if "Cannon" in donor_objects or bpy.data.objects.get("Cannon") is not None:
        raise RuntimeError("Cannon was unexpectedly appended")

    normal_image = save_derived_texture(
        "FederalSoldierSkin_NormalMap.png", "kyx-rev30-normal-detail-2048.png"
    )
    occlusion_image = save_derived_texture(
        "FederalSoldierSkin_Occlusion.png", "kyx-rev30-occlusion-detail-2048.png"
    )
    specular_image = save_derived_texture(
        "FederalSoldierSkin_Specular.tga", "kyx-rev30-specular-detail-2048.png"
    )

    base_material = mapped_texture_material(
        "KYX_REV30_CHARCOAL_GUNMETAL",
        (0.007, 0.013, 0.021, 1.0),
        0.4,
        0.2,
        0.48,
        normal_image,
        occlusion_image,
        specular_image,
    )
    accent_material = mapped_texture_material(
        "KYX_REV30_RESTRAINED_BLUE_ARMOR",
        (0.012, 0.035, 0.055, 1.0),
        0.5,
        0.14,
        0.34,
        normal_image,
        occlusion_image,
        specular_image,
    )
    glove_material = mapped_texture_material(
        "KYX_REV30_FITTED_GUNMETAL_GLOVES",
        (0.006, 0.012, 0.02, 1.0),
        0.42,
        0.16,
        0.38,
        normal_image,
        occlusion_image,
        specular_image,
    )
    clean_knee = clean_knee_material("KYX_REV30_CLEAN_KNEE_GUNMETAL")
    broad_visor_material = visor_material("KYX_REV30_DARK_CYAN_BROAD_VISOR")

    body_source = donor_objects["Body"]
    hand_source = donor_objects["HandSimple"]
    head_source = donor_objects["Head2"]
    head_alignment = donor_objects["Head3"].matrix_world.copy()

    body = retarget_object(
        body_source,
        body_source.matrix_world.copy(),
        donor_rig,
        rig,
        BODY_NAME,
    )
    hand = retarget_object(
        hand_source,
        hand_source.matrix_world.copy(),
        donor_rig,
        rig,
        HAND_NAME,
    )
    head = retarget_object(
        head_source,
        head_alignment,
        donor_rig,
        rig,
        HEAD_NAME,
    )
    knee_silhouette_repair = repair_viewer_right_knee_silhouette(body)

    material_assignments = {
        BODY_NAME: assign_body_materials(
            body_source,
            body,
            donor_rig,
            body_source.matrix_world.copy(),
            base_material,
            accent_material,
            glove_material,
            clean_knee,
        ),
        HAND_NAME: assign_hand_material(hand, glove_material),
        HEAD_NAME: assign_head_materials(
            head_source,
            head,
            donor_rig,
            head_alignment,
            base_material,
            accent_material,
            broad_visor_material,
        ),
    }
    mesh_validation = {}
    for candidate in (body, hand, head):
        before_counts = {
            "vertices": len(candidate.data.vertices),
            "edges": len(candidate.data.edges),
            "polygons": len(candidate.data.polygons),
        }
        edit_mesh = bmesh.new()
        edit_mesh.from_mesh(candidate.data)
        bmesh.ops.recalc_face_normals(edit_mesh, faces=list(edit_mesh.faces))
        edit_mesh.to_mesh(candidate.data)
        edit_mesh.free()
        changed = bool(candidate.data.validate(clean_customdata=False))
        candidate.data.update(calc_edges=True)
        mesh_validation[candidate.name] = {
            "changedByBlenderValidation": changed,
            "before": before_counts,
            "after": {
                "vertices": len(candidate.data.vertices),
                "edges": len(candidate.data.edges),
                "polygons": len(candidate.data.polygons),
            },
        }

    donor_bone_names = [bone.name for bone in donor_rig.data.bones]
    for donor_obj in donor_objects.values():
        bpy.data.objects.remove(donor_obj, do_unlink=True)
    bpy.context.view_layer.update()
    if bpy.data.objects.get("Cannon") is not None:
        raise RuntimeError("Cannon survived donor cleanup")

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj not in {body, hand, head, rifle}:
            obj.hide_render = True
            obj.hide_viewport = True

    for obj in (body, hand, head, rifle):
        obj.hide_render = False
        obj.hide_viewport = False

    rig["kyx_candidate"] = CANDIDATE_ID
    rig["kyx_preserved_from"] = "v6c-character-rev17"
    rig["kyx_donor_license"] = "CC0-1.0"
    rig["kyx_donor_url"] = DONOR_PROVENANCE["sourceUrl"]
    rig.data.pose_position = "POSE"
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    after_actions = action_contract()
    assert_action_contract(after_actions, "adapted master")
    after_bones = [bone.name for bone in rig.data.bones]
    if after_bones != before_bones:
        raise RuntimeError("Adaptation changed Rev17 bone names/order")
    after_sockets = socket_contract(rig)
    if after_sockets != before_sockets:
        raise RuntimeError("Adaptation changed right-hand socket/nozzle matrices")
    if matrix_record(rig.matrix_world) != before_rig_matrix:
        raise RuntimeError("Adaptation changed Rev17 rig scale/origin matrix")

    write_notice()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER_BLEND), check_existing=False)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (rig, body, hand, head, rifle):
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    export_result = bpy.ops.export_scene.gltf(**exporter_kwargs(GLB_PATH))
    if "FINISHED" not in export_result:
        raise RuntimeError(f"GLB export failed: {export_result}")
    glb = parse_glb(GLB_PATH)
    expected_animation_names = sorted(EXPECTED_ACTIONS)
    if sorted(glb["animations"]) != expected_animation_names:
        raise RuntimeError(f"GLB action set changed: {glb['animations']}")
    if glb["joints"] != 66:
        raise RuntimeError(f"GLB skin expected 66 joints, found {glb['joints']}")

    exact_glb = exact_glb_reimport_and_render(
        before_bones,
        before_actions,
        before_sockets,
    )
    report = {
        "candidate": CANDIDATE_ID,
        "sourceMaster": str(SOURCE_MASTER.relative_to(WORKTREE)).replace("\\", "/"),
        "masterBlend": {
            "path": str(MASTER_BLEND.relative_to(WORKTREE)).replace("\\", "/"),
            "bytes": MASTER_BLEND.stat().st_size,
            "sha256": sha256(MASTER_BLEND),
        },
        "runtimeGlb": {
            "path": str(GLB_PATH.relative_to(WORKTREE)).replace("\\", "/"),
            **glb,
        },
        "donorProvenance": DONOR_PROVENANCE,
        "donorRig": {
            "boneCount": len(donor_bone_names),
            "boneNames": donor_bone_names,
        },
        "retarget": {
            "strategy": "rest-pose linear blend skin mapping from donor 63-bone weights to unchanged Rev17 66-bone rig",
            "body": BODY_NAME,
            "rightHand": HAND_NAME,
            "helmet": HEAD_NAME,
            "cannonIncluded": False,
            "materialAssignments": material_assignments,
            "meshValidation": mesh_validation,
            "kneeSilhouetteRepair": knee_silhouette_repair,
            "albedoOrEmissionShipped": False,
            "footLocalScale": [0.86, 0.9, 0.86],
            "footVerticalDropMeters": 0.04,
            "crossSectionScaleRange": [0.86, 0.93],
        },
        "preservedContract": {
            "rigObject": RIG_NAME,
            "rigMatrix": before_rig_matrix,
            "boneCount": len(before_bones),
            "bones": before_bones,
            "actions": before_actions,
            "sockets": before_sockets,
        },
        "exactGlbReimport": exact_glb,
        "renders": exact_glb["renders"],
        "nonclaims": [
            "Candidate only; no human visual acceptance is self-declared.",
            "No broad animation, gameplay, performance or release regression was run.",
            "LOD1, LOD2 and first-person donor derivatives are not authored in this batch.",
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    write_manifest(glb, report)
    print("KYX_REV30_CC0_DONOR_COMPLETE", json.dumps({
        "masterBlend": str(MASTER_BLEND),
        "glb": str(GLB_PATH),
        "report": str(REPORT_PATH),
        "renders": exact_glb["renders"],
    }))


if __name__ == "__main__":
    main()
