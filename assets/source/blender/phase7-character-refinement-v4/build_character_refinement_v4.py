"""Build the provenance-blocked Phase 7 v4 character diagnostic.

This lane intentionally derives its deformation surface and rig from
``public/soldier.glb``.  The governing legacy manifest marks that asset
``releaseEligible: false`` with unresolved provenance, so every output from
this script is diagnostic-only.  It is useful for comparing continuous
anatomy, a real finger rig, authored value grouping, weapon contact, and GLB
export behavior against the rejected primitive v3 lane.  It is not a
canonical hero source and must never be copied to runtime content.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import struct
import time
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector


LANE_DIR = Path(__file__).resolve().parent
REPO_DIR = LANE_DIR.parents[3]
SOURCE_GLB = REPO_DIR / "public" / "soldier.glb"
LEGACY_MANIFEST = REPO_DIR / "assets" / "manifests" / "legacy-soldier.asset.json"
CONCEPT_IMAGE = REPO_DIR / "assets" / "source" / "characters" / "kyx-vanguard" / "concept" / "kyx-vanguard-model-sheet-v1.png"
OUTPUT_DIR = LANE_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v4_diagnostic.blend"
GLB_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v4_diagnostic.glb"
REPORT_PATH = OUTPUT_DIR / "character-refinement-v4-diagnostic-report.json"

FRAME_START = 1
FRAME_MID = 16
FRAME_END = 32
FPS = 24
RENDER_SIZE = 960

INK = (0.013, 0.018, 0.028, 1.0)
CHARCOAL = (0.052, 0.067, 0.092, 1.0)
CHARCOAL_RAISED = (0.095, 0.110, 0.140, 1.0)
CERAMIC = (0.79, 0.75, 0.67, 1.0)
CERAMIC_EDGE = (0.46, 0.47, 0.46, 1.0)
OXIDE = (0.71, 0.105, 0.055, 1.0)
AQUA = (0.035, 0.59, 0.61, 1.0)
RUBBER = (0.017, 0.022, 0.030, 1.0)
GUNMETAL = (0.055, 0.066, 0.078, 1.0)
FLOOR = (0.026, 0.032, 0.040, 1.0)
BACKDROP = (0.075, 0.087, 0.103, 1.0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
    micro_bump: float = 0.0,
    emission: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material["kyx_original_base_color"] = list(color)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        principled.inputs["Emission Color"].default_value = color
        principled.inputs["Emission Strength"].default_value = emission
    if micro_bump > 0.0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = f"{name}_woven_micro"
        noise.inputs["Scale"].default_value = 145.0
        noise.inputs["Detail"].default_value = 2.0
        noise.inputs["Roughness"].default_value = 0.62
        bump = nodes.new("ShaderNodeBump")
        bump.name = f"{name}_micro_normal"
        bump.inputs["Strength"].default_value = micro_bump
        bump.inputs["Distance"].default_value = 0.0025
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.name = "SCENE_KYX_Phase7_V4_PROVENANCE_BLOCKED_DIAGNOSTIC"
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.world = bpy.data.worlds.new("WORLD_V4_Diagnostic")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = BACKDROP
    background.inputs["Strength"].default_value = 0.23
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene["kyx_status"] = "DIAGNOSTIC_ONLY_PROVENANCE_BLOCKED"
    scene["kyx_release_eligible"] = False
    scene["kyx_g6_status"] = "not_claimed"
    scene["kyx_runtime_integration"] = "forbidden"
    scene["kyx_source_manifest"] = "assets/manifests/legacy-soldier.asset.json"
    scene["kyx_concept_reference"] = "assets/source/characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png"


def import_diagnostic_base(collection: bpy.types.Collection) -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object, list[str]]:
    manifest = json.loads(LEGACY_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("releaseEligible") is not False:
        raise RuntimeError("Legacy soldier manifest unexpectedly permits release")
    if manifest.get("provenance", {}).get("status") != "unresolved":
        raise RuntimeError("Expected unresolved legacy soldier provenance")
    if manifest.get("disposition") != "temporary_diagnostic_only_then_replace":
        raise RuntimeError("Unexpected legacy soldier disposition")
    if sha256(SOURCE_GLB) != manifest.get("sourceHash"):
        raise RuntimeError("Legacy soldier source digest does not match governing manifest")

    before = set(bpy.context.scene.objects)
    result = bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not import diagnostic base: {result}")
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    for obj in list(imported):
        if obj.name == "Icosphere":
            imported.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    armature = next(obj for obj in imported if obj.type == "ARMATURE")
    body = next(obj for obj in imported if obj.type == "MESH" and "visor" not in obj.name.lower())
    visor = next(obj for obj in imported if obj.type == "MESH" and "visor" in obj.name.lower())
    for obj in imported:
        move_to_collection(obj, collection)
    armature.name = "RIG_DIAGNOSTIC_Mixamo49_PROVENANCE_BLOCKED"
    body.name = "BODY_DIAGNOSTIC_RemodelStudy_PROVENANCE_BLOCKED"
    visor.name = "VISOR_DIAGNOSTIC_PROVENANCE_BLOCKED"
    for obj in (armature, body, visor):
        obj["kyx_status"] = "DIAGNOSTIC_ONLY_PROVENANCE_BLOCKED"
        obj["kyx_release_eligible"] = False
        obj["kyx_source_asset"] = "legacy.soldier"
    action_names = sorted(action.name for action in bpy.data.actions)
    return armature, body, visor, action_names


def remodel_and_repaint_body(
    body: bpy.types.Object,
    visor: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> dict[str, int]:
    """Make a bounded visual study without pretending to author new topology.

    The deformation is deliberately modest: it slims the diagnostic mesh and
    groups existing continuous topology into concept-sheet value masses.  The
    report calls this what it is: a soldier-derived comparison, not original
    production modeling.
    """

    mesh = body.data
    for vertex in mesh.vertices:
        x, y, z = vertex.co
        if 0.93 <= z <= 1.42:
            waist = max(0.0, 1.0 - abs(z - 1.10) / 0.32)
            vertex.co.x *= 0.94 - 0.055 * waist
            vertex.co.y *= 0.90 - 0.035 * waist
        elif z < 0.93:
            leg_center = 0.115 if x >= 0.0 else -0.115
            vertex.co.x = leg_center + (x - leg_center) * 0.94
            vertex.co.y *= 0.94
        elif z > 1.42:
            vertex.co.x *= 0.965
            vertex.co.y *= 0.94
    mesh.update()

    mesh.materials.clear()
    ordered = [materials[key] for key in ("cloth", "cloth_raised", "armor", "armor_edge", "oxide", "rubber")]
    for material in ordered:
        mesh.materials.append(material)
    counts = {key: 0 for key in ("cloth", "cloth_raised", "armor", "armor_edge", "oxide", "rubber")}

    for polygon in mesh.polygons:
        center = sum((mesh.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        x, y, z = center
        key = "cloth"
        if z < 0.17:
            key = "rubber"
        elif z > 1.44:
            key = "armor" if y > -0.03 or abs(x) > 0.12 else "cloth_raised"
        elif z > 1.25:
            if y > 0.035 or abs(x) > 0.205:
                key = "armor"
            else:
                key = "cloth_raised"
            if x < -0.19 and y > 0.02 and z > 1.31:
                key = "oxide"
        elif 0.78 < z <= 1.25 and abs(x) > 0.225 and y > -0.03:
            key = "armor_edge"
        elif 0.22 < z < 0.67 and y > 0.015:
            key = "armor" if z > 0.33 else "armor_edge"
        elif 0.68 <= z <= 1.18 and abs(x) < 0.19:
            key = "cloth_raised"
        polygon.material_index = ("cloth", "cloth_raised", "armor", "armor_edge", "oxide", "rubber").index(key)
        counts[key] += 1

    for polygon in mesh.polygons:
        polygon.use_smooth = True
    body["kyx_visual_study"] = "continuous_anatomy_and_integrated_value_masses"
    body["kyx_original_topology"] = False

    visor.data.materials.clear()
    visor.data.materials.append(materials["aqua"])
    for polygon in visor.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    return counts


def mesh_from_vertices_faces(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    return obj


def add_extruded_xz_profile(
    name: str,
    profile: list[tuple[float, float]],
    y_center: float,
    thickness: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.008,
) -> bpy.types.Object:
    count = len(profile)
    vertices = [(x, y_center - thickness / 2.0, z) for x, z in profile]
    vertices += [(x, y_center + thickness / 2.0, z) for x, z in profile]
    faces: list[tuple[int, ...]] = [tuple(range(count - 1, -1, -1)), tuple(range(count, 2 * count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = mesh_from_vertices_faces(name, vertices, faces, material, collection)
    if bevel > 0.0:
        modifier = obj.modifiers.new("AuthoredEdgeBreak", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)
    return obj


def add_cylinder_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    vertices: int = 16,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(a + b) / 2.0)
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("MachinedEdge", "BEVEL")
    bevel.width = radius * 0.14
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def build_scarf(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    segments = 28
    rings = (
        (1.382, 0.185, 0.145, -0.006),
        (1.430, 0.205, 0.158, 0.006),
        (1.474, 0.177, 0.145, -0.003),
    )
    vertices: list[tuple[float, float, float]] = []
    for z, rx, ry, phase in rings:
        for index in range(segments):
            angle = math.tau * index / segments
            drape = -0.018 * (0.5 + 0.5 * math.cos(angle - 0.35))
            vertices.append((rx * math.cos(angle), ry * math.sin(angle) - 0.005, z + drape + phase * math.sin(angle)))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(rings) - 1):
        base = ring * segments
        nxt = (ring + 1) * segments
        for index in range(segments):
            j = (index + 1) % segments
            faces.append((base + index, base + j, nxt + j, nxt + index))
    scarf = mesh_from_vertices_faces("SCARF_DIAGNOSTIC_AsymmetricDrape", vertices, faces, material, collection)
    solid = scarf.modifiers.new("ScarfThickness", "SOLIDIFY")
    solid.thickness = 0.009
    solid.offset = 0.0
    bevel = scarf.modifiers.new("ScarfSoftEdge", "BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    for polygon in scarf.data.polygons:
        polygon.use_smooth = True
    world = scarf.matrix_world.copy()
    scarf.parent = armature
    scarf.parent_type = "BONE"
    scarf.parent_bone = "mixamorig:Spine2"
    scarf.matrix_world = world
    scarf["kyx_status"] = "DIAGNOSTIC_ONLY_PROVENANCE_BLOCKED"
    scarf["kyx_design_role"] = "concept_asymmetric_neck_scarf_study"
    return scarf


def build_unified_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    parts: list[bpy.types.Object] = []
    # Receiver and handguard are deliberate side profiles, not a stack of cubes.
    parts.append(add_extruded_xz_profile(
        "RIFLE_ReceiverShell",
        [(-0.16, 1.255), (-0.10, 1.375), (0.235, 1.372), (0.305, 1.315), (0.252, 1.235), (-0.055, 1.225)],
        0.305,
        0.105,
        materials["gunmetal"],
        collection,
        bevel=0.012,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_CeramicUpper",
        [(-0.48, 1.285), (-0.405, 1.355), (-0.13, 1.365), (-0.075, 1.325), (-0.13, 1.275), (-0.43, 1.268)],
        0.305,
        0.096,
        materials["armor"],
        collection,
        bevel=0.010,
    ))
    # Skeletal stock forms one functional shoulder triangle.
    parts.append(add_extruded_xz_profile(
        "RIFLE_StockUpper",
        [(0.23, 1.338), (0.49, 1.405), (0.515, 1.375), (0.285, 1.285)],
        0.305,
        0.045,
        materials["gunmetal"],
        collection,
        bevel=0.009,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_StockLower",
        [(0.285, 1.285), (0.49, 1.405), (0.505, 1.315), (0.33, 1.235)],
        0.305,
        0.045,
        materials["gunmetal"],
        collection,
        bevel=0.009,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_ShoulderPad",
        [(0.49, 1.405), (0.555, 1.390), (0.548, 1.260), (0.505, 1.315)],
        0.305,
        0.07,
        materials["rubber"],
        collection,
        bevel=0.012,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_PistolGrip",
        [(0.145, 1.245), (0.245, 1.24), (0.255, 1.075), (0.185, 1.035), (0.12, 1.085)],
        0.305,
        0.075,
        materials["rubber"],
        collection,
        bevel=0.011,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_Magazine",
        [(-0.02, 1.235), (0.075, 1.235), (0.055, 1.015), (-0.05, 1.04)],
        0.305,
        0.077,
        materials["gunmetal"],
        collection,
        bevel=0.009,
    ))
    parts.append(add_cylinder_between("RIFLE_Barrel", (-0.75, 0.305, 1.302), (-0.455, 0.305, 1.302), 0.019, materials["gunmetal"], collection))
    parts.append(add_cylinder_between("RIFLE_Muzzle", (-0.84, 0.305, 1.302), (-0.735, 0.305, 1.302), 0.032, materials["rubber"], collection, vertices=20))
    parts.append(add_extruded_xz_profile(
        "RIFLE_Optic",
        [(-0.04, 1.385), (0.105, 1.385), (0.125, 1.445), (-0.025, 1.455)],
        0.305,
        0.065,
        materials["gunmetal"],
        collection,
        bevel=0.010,
    ))
    parts.append(add_extruded_xz_profile(
        "RIFLE_OpticGlass",
        [(0.090, 1.397), (0.127, 1.405), (0.127, 1.440), (0.100, 1.446)],
        0.305,
        0.069,
        materials["aqua"],
        collection,
        bevel=0.004,
    ))
    # Recessed handguard vents read as a designed thermal break.
    for index, x in enumerate((-0.37, -0.29, -0.21)):
        parts.append(add_extruded_xz_profile(
            f"RIFLE_Vent_{index}",
            [(x - 0.027, 1.296), (x + 0.025, 1.302), (x + 0.020, 1.328), (x - 0.023, 1.326)],
            0.253,
            0.008,
            materials["rubber"],
            collection,
            bevel=0.004,
        ))

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    rifle = parts[0]
    rifle.name = "WEAPON_DIAGNOSTIC_KYX_AR01_UnifiedStudy"
    rifle["kyx_status"] = "DIAGNOSTIC_ONLY_NOT_RUNTIME_WEAPON"
    rifle["kyx_design_role"] = "unified_receiver_contact_proportion_study"
    return rifle


def world_bone_head(armature: bpy.types.Object, bone_name: str) -> Vector:
    return armature.matrix_world @ armature.pose.bones[bone_name].head


def solve_arm_to_contact(
    armature: bpy.types.Object,
    side: str,
    hand_target: Vector,
    elbow_target: Vector,
    seed: int,
) -> dict[str, object]:
    upper_name = f"mixamorig:{side}Arm"
    fore_name = f"mixamorig:{side}ForeArm"
    hand_name = f"mixamorig:{side}Hand"
    bases = {
        upper_name: armature.pose.bones[upper_name].matrix_basis.copy(),
        fore_name: armature.pose.bones[fore_name].matrix_basis.copy(),
    }

    def apply(parameters: list[float]) -> None:
        armature.pose.bones[upper_name].matrix_basis = bases[upper_name] @ Euler(parameters[:3], "XYZ").to_matrix().to_4x4()
        armature.pose.bones[fore_name].matrix_basis = bases[fore_name] @ Euler(parameters[3:], "XYZ").to_matrix().to_4x4()
        bpy.context.view_layer.update()

    def objective(parameters: list[float]) -> float:
        apply(parameters)
        hand_error = (world_bone_head(armature, hand_name) - hand_target).length
        elbow_error = (world_bone_head(armature, fore_name) - elbow_target).length
        regularization = sum(value * value for value in parameters)
        return hand_error + 0.14 * elbow_error + 0.006 * regularization

    randomizer = random.Random(seed)
    starts = [[0.0] * 6]
    for _ in range(12):
        starts.append([randomizer.uniform(-1.15, 1.15) for _ in range(6)])
    best_parameters = starts[0]
    best_score = float("inf")
    for initial in starts:
        parameters = initial[:]
        score = objective(parameters)
        step = 0.48
        for _ in range(9):
            changed = True
            sweeps = 0
            while changed and sweeps < 3:
                changed = False
                sweeps += 1
                for index in range(6):
                    local_best = score
                    local_value = parameters[index]
                    for direction in (-1.0, 1.0):
                        candidate = parameters[:]
                        candidate[index] = max(-1.75, min(1.75, candidate[index] + direction * step))
                        candidate_score = objective(candidate)
                        if candidate_score < local_best:
                            local_best = candidate_score
                            local_value = candidate[index]
                    if local_best + 1e-8 < score:
                        parameters[index] = local_value
                        score = local_best
                        changed = True
                    else:
                        apply(parameters)
            step *= 0.52
        if score < best_score:
            best_score = score
            best_parameters = parameters[:]
    apply(best_parameters)
    hand_position = world_bone_head(armature, hand_name)
    elbow_position = world_bone_head(armature, fore_name)
    return {
        "side": side,
        "parametersRadians": [round(value, 6) for value in best_parameters],
        "handTarget": [round(value, 6) for value in hand_target],
        "handPosition": [round(value, 6) for value in hand_position],
        "handErrorMeters": round((hand_position - hand_target).length, 6),
        "elbowTarget": [round(value, 6) for value in elbow_target],
        "elbowPosition": [round(value, 6) for value in elbow_position],
        "objective": round(best_score, 6),
    }


def curl_fingers(armature: bpy.types.Object, side: str, *, support: bool) -> None:
    sign = -1.0 if side == "Left" else 1.0
    amounts = {
        "Index": (0.52 if support else 0.40, 0.62, 0.42),
        "Middle": (0.68, 0.72, 0.45),
        "Ring": (0.72, 0.76, 0.50),
        "Pinky": (0.78, 0.78, 0.54),
    }
    for finger, bends in amounts.items():
        for joint, bend in enumerate(bends, start=1):
            name = f"mixamorig:{side}Hand{finger}{joint}"
            bone = armature.pose.bones.get(name)
            if bone:
                bone.matrix_basis = bone.matrix_basis @ Euler((0.0, 0.0, sign * bend), "XYZ").to_matrix().to_4x4()
    for joint, bend in enumerate((0.34, 0.52, 0.34), start=1):
        name = f"mixamorig:{side}HandThumb{joint}"
        bone = armature.pose.bones.get(name)
        if bone:
            bone.matrix_basis = bone.matrix_basis @ Euler((0.0, sign * bend, sign * bend * 0.25), "XYZ").to_matrix().to_4x4()
    bpy.context.view_layer.update()


def build_contact_action(armature: bpy.types.Object) -> tuple[bpy.types.Action, list[dict[str, object]]]:
    if armature.animation_data is None:
        armature.animation_data_create()
    idle = bpy.data.actions.get("Idle")
    if idle is None:
        raise RuntimeError("Diagnostic base no longer contains its Idle action")
    armature.animation_data.action = idle
    bpy.context.scene.frame_set(FRAME_START)
    bpy.context.view_layer.update()
    idle_pose = {bone.name: bone.matrix_basis.copy() for bone in armature.pose.bones}

    action = bpy.data.actions.new("KYX_V4_Diagnostic_CombatReady")
    armature.animation_data.action = action
    for bone in armature.pose.bones:
        bone.matrix_basis = idle_pose[bone.name]
        bone.rotation_mode = "QUATERNION"
    bpy.context.view_layer.update()

    solutions = [
        solve_arm_to_contact(
            armature,
            "Right",
            Vector((0.185, 0.305, 1.178)),
            Vector((0.365, 0.085, 1.245)),
            4107,
        ),
        solve_arm_to_contact(
            armature,
            "Left",
            Vector((-0.345, 0.315, 1.245)),
            Vector((-0.425, 0.095, 1.255)),
            8119,
        ),
    ]
    # Rotate the palms into a horizontal grip after the positional solve.
    armature.pose.bones["mixamorig:RightHand"].matrix_basis = armature.pose.bones["mixamorig:RightHand"].matrix_basis @ Euler((0.18, -0.30, -0.16), "XYZ").to_matrix().to_4x4()
    armature.pose.bones["mixamorig:LeftHand"].matrix_basis = armature.pose.bones["mixamorig:LeftHand"].matrix_basis @ Euler((-0.22, 0.34, 0.12), "XYZ").to_matrix().to_4x4()
    curl_fingers(armature, "Right", support=False)
    curl_fingers(armature, "Left", support=True)
    bpy.context.view_layer.update()
    combat_pose = {bone.name: bone.matrix_basis.copy() for bone in armature.pose.bones}

    def key_all(frame: int) -> None:
        for bone in armature.pose.bones:
            bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
            bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)

    bpy.context.scene.frame_set(FRAME_START)
    for bone in armature.pose.bones:
        bone.matrix_basis = combat_pose[bone.name]
    key_all(FRAME_START)

    bpy.context.scene.frame_set(FRAME_MID)
    for bone in armature.pose.bones:
        bone.matrix_basis = combat_pose[bone.name]
    spine = armature.pose.bones["mixamorig:Spine2"]
    spine.matrix_basis = spine.matrix_basis @ Euler((math.radians(0.7), 0.0, math.radians(-0.25)), "XYZ").to_matrix().to_4x4()
    key_all(FRAME_MID)

    bpy.context.scene.frame_set(FRAME_END)
    for bone in armature.pose.bones:
        bone.matrix_basis = combat_pose[bone.name]
    key_all(FRAME_END)
    # Blender 5.x stores action curves in layered channel bags; keyframe
    # insertion already creates Bezier interpolation, so no legacy
    # ``action.fcurves`` traversal is required here.
    bpy.context.scene.frame_set(FRAME_START)
    return action, solutions


def parent_to_hand(rifle: bpy.types.Object, armature: bpy.types.Object) -> None:
    world = rifle.matrix_world.copy()
    rifle.parent = armature
    rifle.parent_type = "BONE"
    rifle.parent_bone = "mixamorig:RightHand"
    rifle.matrix_world = world


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_rounded_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.scale = scale
    obj.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("StudioEdge", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 2
    return obj


def build_studio(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    add_rounded_box("PRES_Floor", (0.0, 0.0, -0.055), (5.5, 5.5, 0.10), materials["floor"], collection)
    add_rounded_box("PRES_Backdrop", (0.0, -1.35, 1.45), (5.2, 0.08, 3.0), materials["backdrop"], collection)
    add_rounded_box("PRES_OxideSlash", (-1.42, -1.25, 1.25), (0.035, 0.025, 2.1), materials["oxide"], collection)

    camera_data = bpy.data.cameras.new("CAMDATA_V4_Diagnostic")
    camera = bpy.data.objects.new("CAM_V4_Diagnostic", camera_data)
    collection.objects.link(camera)
    camera_data.lens = 70.0
    camera_data.sensor_width = 36.0
    bpy.context.scene.camera = camera

    def light(name: str, location: tuple[float, float, float], energy: float, color: tuple[float, float, float], size: float) -> None:
        data = bpy.data.lights.new(f"{name}_DATA", "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0.0, 0.0, 1.05))

    light("LIGHT_Key", (-3.4, 4.1, 4.5), 1250.0, (0.78, 0.88, 1.0), 3.1)
    light("LIGHT_Fill", (3.2, 2.7, 2.8), 690.0, (0.48, 0.86, 0.80), 2.7)
    light("LIGHT_Rim", (1.0, -2.7, 3.5), 1120.0, (1.0, 0.28, 0.13), 2.1)
    light("LIGHT_Front", (0.0, 4.2, 1.7), 330.0, (0.92, 0.86, 0.76), 2.3)
    light("LIGHT_Back", (-1.5, -1.15, 2.5), 850.0, (0.66, 0.77, 0.90), 2.7)
    return camera


def set_camera(
    camera: bpy.types.Object,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    *,
    lens: float = 70.0,
    ortho_scale: float | None = None,
) -> None:
    camera.location = location
    if ortho_scale is None:
        camera.data.type = "PERSP"
        camera.data.lens = lens
    else:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho_scale
    look_at(camera, target)


def set_grayscale(materials: dict[str, bpy.types.Material], enabled: bool) -> None:
    luminance = {
        "cloth": 0.085,
        "cloth_raised": 0.14,
        "armor": 0.70,
        "armor_edge": 0.44,
        "oxide": 0.36,
        "aqua": 0.72,
        "rubber": 0.028,
        "gunmetal": 0.09,
    }
    for key, material in materials.items():
        if key not in luminance:
            continue
        principled = material.node_tree.nodes.get("Principled BSDF")
        if enabled:
            value = luminance[key]
            principled.inputs["Base Color"].default_value = (value, value, value, 1.0)
            if key == "aqua":
                principled.inputs["Emission Color"].default_value = (value, value, value, 1.0)
        else:
            color = tuple(material["kyx_original_base_color"])
            principled.inputs["Base Color"].default_value = color
            if key == "aqua":
                principled.inputs["Emission Color"].default_value = color


def render_stills(camera: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> tuple[dict[str, float], list[str]]:
    scene = bpy.context.scene
    scene.frame_set(FRAME_START)
    views = (
        ("close-color", (2.28, 3.75, 2.02), (0.0, 0.08, 1.18), 74.0, None, False),
        ("front-ortho-color", (0.0, 4.8, 0.95), (0.0, 0.02, 0.95), 70.0, 2.10, False),
        ("side-ortho-color", (4.4, 0.06, 0.95), (0.0, 0.06, 0.95), 70.0, 2.10, False),
        ("back-ortho-color", (0.0, -1.20, 0.95), (0.0, -0.03, 0.95), 70.0, 2.10, False),
        ("weapon-contact-color", (1.32, 2.48, 1.50), (-0.04, 0.28, 1.26), 94.0, None, False),
        ("trigger-contact-color", (-1.28, 2.43, 1.47), (0.16, 0.29, 1.20), 96.0, None, False),
        ("close-grayscale", (2.28, 3.75, 2.02), (0.0, 0.08, 1.18), 74.0, None, True),
        ("front-ortho-grayscale", (0.0, 4.8, 0.95), (0.0, 0.02, 0.95), 70.0, 2.10, True),
    )
    timings: dict[str, float] = {}
    paths: list[str] = []
    grayscale_state = False
    for name, location, target, lens, ortho_scale, grayscale in views:
        if grayscale != grayscale_state:
            set_grayscale(materials, grayscale)
            grayscale_state = grayscale
        set_camera(camera, location, target, lens=lens, ortho_scale=ortho_scale)
        render_path = RENDER_DIR / f"refinement-v4-diagnostic-{name}.png"
        scene.render.filepath = str(render_path)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        timings[name] = round(time.perf_counter() - started, 6)
        paths.append(render_path.relative_to(LANE_DIR).as_posix())
    if grayscale_state:
        set_grayscale(materials, False)
    return timings, paths


def inspect_glb(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError("Invalid GLB header")
    version, declared_length = struct.unpack_from("<II", data, 4)
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
    document = json.loads(data[20:20 + json_length].rstrip(b" \x00").decode("utf-8"))
    animations = document.get("animations", [])
    primitives = sum(len(mesh.get("primitives", [])) for mesh in document.get("meshes", []))
    return {
        "version": version,
        "declaredBytes": declared_length,
        "generator": document.get("asset", {}).get("generator"),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "primitives": primitives,
        "materials": len(document.get("materials", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(animations),
        "animationNames": [animation.get("name") for animation in animations],
        "animationChannels": sum(len(animation.get("channels", [])) for animation in animations),
        "requiredExtensions": document.get("extensionsRequired", []),
    }


def export_diagnostic_glb(objects: list[bpy.types.Object]) -> float:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    armature = next(obj for obj in objects if obj.type == "ARMATURE")
    bpy.context.view_layer.objects.active = armature
    started = time.perf_counter()
    result = bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_copyright="DIAGNOSTIC ONLY; derived from unresolved-provenance legacy.soldier; NOT RELEASE ELIGIBLE",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_extra_animations=True,
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=True,
        export_def_bones=True,
        export_leaf_bone=False,
        export_optimize_animation_size=True,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_lights=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Diagnostic GLB export failed: {result}")
    return time.perf_counter() - started


def output_manifest(paths: list[Path]) -> list[dict[str, object]]:
    return [
        {
            "path": path.relative_to(LANE_DIR).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in paths
    ]


def main() -> None:
    started = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    configure_scene()
    export_collection = make_collection("COLL_V4_DIAGNOSTIC_EXPORT_PROVENANCE_BLOCKED")
    presentation_collection = make_collection("COLL_V4_DIAGNOSTIC_PRESENTATION")
    materials = {
        "cloth": make_material("MAT_V4_CharcoalWoven", CHARCOAL, roughness=0.89, micro_bump=0.18),
        "cloth_raised": make_material("MAT_V4_CharcoalRaised", CHARCOAL_RAISED, roughness=0.83, micro_bump=0.13),
        "armor": make_material("MAT_V4_PaperCeramic", CERAMIC, roughness=0.53, metallic=0.05, micro_bump=0.025),
        "armor_edge": make_material("MAT_V4_CeramicEdge", CERAMIC_EDGE, roughness=0.48, metallic=0.08),
        "oxide": make_material("MAT_V4_OxideAccent", OXIDE, roughness=0.52, metallic=0.03),
        "aqua": make_material("MAT_V4_AquaSystem", AQUA, roughness=0.24, metallic=0.12, emission=1.8),
        "rubber": make_material("MAT_V4_Rubber", RUBBER, roughness=0.91, micro_bump=0.08),
        "gunmetal": make_material("MAT_V4_Gunmetal", GUNMETAL, roughness=0.38, metallic=0.52),
        "floor": make_material("MAT_V4_StudioFloor", FLOOR, roughness=0.68),
        "backdrop": make_material("MAT_V4_StudioBackdrop", BACKDROP, roughness=0.82),
    }

    armature, body, visor, inherited_actions = import_diagnostic_base(export_collection)
    material_faces = remodel_and_repaint_body(body, visor, materials)
    action, contact_solutions = build_contact_action(armature)
    rifle = build_unified_rifle(export_collection, materials)
    parent_to_hand(rifle, armature)
    scarf = build_scarf(export_collection, armature, materials["cloth_raised"])

    export_objects = [armature, body, visor, rifle, scarf]
    export_seconds = export_diagnostic_glb(export_objects)
    camera = build_studio(presentation_collection, materials)
    render_timings, render_paths = render_stills(camera, materials)
    bpy.context.scene.frame_set(FRAME_START)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    backup = Path(f"{BLEND_PATH}1")
    if backup.exists():
        backup.unlink()

    glb_info = inspect_glb(GLB_PATH)
    export_meshes = [obj for obj in export_objects if obj.type == "MESH"]
    vertices = sum(len(obj.data.vertices) for obj in export_meshes)
    polygons = sum(len(obj.data.polygons) for obj in export_meshes)
    triangles = sum(len(polygon.vertices) - 2 for obj in export_meshes for polygon in obj.data.polygons)
    render_files = [LANE_DIR / path for path in render_paths]
    verification = {
        "legacyManifestBlocksRelease": json.loads(LEGACY_MANIFEST.read_text(encoding="utf-8"))["releaseEligible"] is False,
        "sourceDigestMatchesLegacyManifest": sha256(SOURCE_GLB) == json.loads(LEGACY_MANIFEST.read_text(encoding="utf-8"))["sourceHash"],
        "glbHeaderValid": glb_info["version"] == 2 and glb_info["declaredBytes"] == GLB_PATH.stat().st_size,
        "glbContainsMeshes": glb_info["meshes"] >= 4,
        "glbContainsMaterials": glb_info["materials"] >= 6,
        "glbContainsSkin": glb_info["skins"] >= 1,
        "glbContainsDiagnosticAction": "KYX_V4_Diagnostic_CombatReady" in glb_info["animationNames"],
        "contactSolveWithinSixCentimeters": all(solution["handErrorMeters"] <= 0.06 for solution in contact_solutions),
        "reviewRendersPresent": len(render_files) == 8 and all(path.is_file() and path.stat().st_size > 10000 for path in render_files),
    }
    if not all(verification.values()):
        failed = [name for name, passed in verification.items() if not passed]
        raise RuntimeError(f"V4 diagnostic verification failed: {failed}; glb={glb_info}; contacts={contact_solutions}")

    manifest_paths = [GLB_PATH, BLEND_PATH, *render_files]
    report = {
        "schemaVersion": 1,
        "assetId": "kyx_phase7_character_refinement_v4_diagnostic",
        "status": "DIAGNOSTIC_ONLY_PROVENANCE_BLOCKED_NOT_G6",
        "releaseEligible": False,
        "runtimeIntegrationAllowed": False,
        "humanApproved": False,
        "provenance": {
            "derivedFrom": "public/soldier.glb",
            "governingManifest": "assets/manifests/legacy-soldier.asset.json",
            "sourceSha256": sha256(SOURCE_GLB),
            "status": "unresolved",
            "warnings": ["UNRESOLVED_PROVENANCE", "INCOMPLETE_ANIMATION_SET"],
            "disposition": "temporary_diagnostic_only_then_replace",
            "conceptReference": "assets/source/characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png",
            "conceptSha256": sha256(CONCEPT_IMAGE),
        },
        "purpose": [
            "Compare continuous weighted anatomy and real hands against rejected primitive v3.",
            "Exercise a concept-directed value/material study and unified weapon silhouette.",
            "Prove two-hand contact solving, armature preservation, action export, and inspection renders.",
            "Define what the original v5 canonical source must rebuild without using this geometry or rig.",
        ],
        "blenderVersion": bpy.app.version_string,
        "scene": {
            "forwardAxis": "+Y",
            "upAxis": "+Z",
            "units": "meters",
            "frames": [FRAME_START, FRAME_END],
            "fps": FPS,
            "renderSize": [RENDER_SIZE, RENDER_SIZE],
        },
        "source": {
            "meshObjects": len(export_meshes),
            "vertices": vertices,
            "polygons": polygons,
            "triangles": triangles,
            "bones": len(armature.data.bones),
            "inheritedActions": inherited_actions,
            "diagnosticAction": action.name,
            "materialFaceGroups": material_faces,
        },
        "contact": {
            "solutions": contact_solutions,
            "stockShoulderContact": [0.535, 0.305, 1.335],
            "triggerGripCenter": [0.185, 0.305, 1.178],
            "supportHandguardCenter": [-0.345, 0.315, 1.245],
            "note": "Numeric arm solve plus articulated diagnostic fingers; rendered plates remain the visual authority.",
        },
        "glb": {
            **glb_info,
            "path": GLB_PATH.relative_to(LANE_DIR).as_posix(),
            "bytes": GLB_PATH.stat().st_size,
            "sha256": sha256(GLB_PATH),
            "exportSeconds": round(export_seconds, 6),
        },
        "renders": {
            "paths": render_paths,
            "timingsSeconds": render_timings,
            "totalSeconds": round(sum(render_timings.values()), 6),
        },
        "verification": {
            "status": "PASS",
            "checks": verification,
            "scope": "structural diagnostic validity only; never release eligibility or G6",
        },
        "visualDecisionBoundary": {
            "reviewStatus": "REJECTED_VISUAL_DIAGNOSTIC_FAILURE",
            "clearsUserBlockinessComplaint": False,
            "observedFailures": [
                "Rifle floats across and in front of both hands; numeric wrist-origin accuracy did not produce palm or digit contact.",
                "Support hand remains open and trigger-hand relationship is visually invalid.",
                "Inherited head and helmet expose broken white shard-like surfaces under the new material grouping.",
                "Broad white body regions read as untextured and polygon classification creates jagged arbitrary boundaries.",
                "Inherited anatomy remains bulky and generic rather than the athletic tactical-manga target.",
                "The diagnostic rifle remains a flat extruded profile rather than a production unified hard-surface asset.",
            ],
            "usefulFinding": "Continuous topology, a skin, fingers, actions, and exact joint coordinates are necessary but not sufficient for visual quality or weapon contact.",
            "cannotProve": [
                "original production topology",
                "release rights",
                "canonical skeleton or weight quality",
                "complete benchmark animation matrix",
                "authored UV texture sets",
                "LODs or runtime performance",
                "human visual acceptance",
            ],
        },
        "manifest": output_manifest(manifest_paths),
        "elapsedSeconds": round(time.perf_counter() - started, 6),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "report": str(REPORT_PATH),
        "glb": report["glb"],
        "contacts": contact_solutions,
        "renders": render_paths,
    }, indent=2))


if __name__ == "__main__":
    main()
