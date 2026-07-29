"""Reimport, validate, and render direct-GLB Rev31 role helmet evidence."""

from __future__ import annotations

from datetime import datetime, timezone
import bpy
import hashlib
import json
import math
from mathutils import Vector
from pathlib import Path
import sys
from typing import Any


EXPECTED_ROLES = ("assault", "breacher", "recon", "duelist")
EXPECTED_ACTIONS = {
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
}
ROLE_LABELS = {
    "assault": "ASSAULT / RIFLE",
    "breacher": "BREACHER / SHOTGUN",
    "recon": "RECON / SNIPER",
    "duelist": "DUELIST / MELEE",
}
VIEWS = {
    "front": {
        "camera": (0.0, -4.2, 1.08),
        "target": (0.0, -0.02, 0.92),
        "scale": 2.03,
    },
    "side": {
        "camera": (4.2, 0.0, 1.08),
        "target": (0.0, -0.02, 0.92),
        "scale": 2.03,
    },
    "three-quarter": {
        "camera": (3.2, -3.2, 1.18),
        "target": (0.0, -0.02, 0.97),
        "scale": 2.05,
    },
}


def arguments() -> tuple[Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <runtime-dir> <evidence-dir> <validation-report.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit(f"Expected three arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_scene() -> bpy.types.Scene:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_stamp = True
    scene.render.use_stamp_note = True
    scene.render.use_stamp_date = False
    scene.render.use_stamp_time = False
    scene.render.use_stamp_render_time = False
    scene.render.use_stamp_frame = False
    scene.render.use_stamp_scene = False
    scene.render.use_stamp_camera = False
    scene.render.use_stamp_filename = False
    scene.render.use_stamp_marker = False
    scene.render.use_stamp_sequencer_strip = False
    scene.render.use_stamp_hostname = False
    scene.render.stamp_font_size = 16
    scene.render.stamp_foreground = (0.85, 0.91, 0.96, 1.0)
    scene.render.stamp_background = (0.006, 0.010, 0.016, 0.86)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("KYX_REV31_EVIDENCE_WORLD")
        scene.world.use_nodes = True
    scene.world.color = (0.004, 0.007, 0.011)
    if scene.world.use_nodes:
        background = scene.world.node_tree.nodes.get("Background")
        if background is not None:
            background.inputs["Color"].default_value = (
                0.004,
                0.007,
                0.011,
                1.0,
            )
            background.inputs["Strength"].default_value = 0.19
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
    target: tuple[float, float, float],
) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name=name, object_data=data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, Vector(target))


def add_stage() -> None:
    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, -0.002))
    floor = bpy.context.active_object
    floor.name = "KYX_REV31_EVIDENCE_FLOOR"
    floor_material = bpy.data.materials.new(name="KYX_REV31_EVIDENCE_FLOOR_MAT")
    floor_material.diffuse_color = (0.025, 0.035, 0.045, 1.0)
    floor.data.materials.append(floor_material)
    add_area_light(
        "KYX_REV31_KEY",
        (2.6, -3.5, 4.1),
        780.0,
        (0.73, 0.87, 1.0),
        4.0,
        (0.0, 0.0, 1.0),
    )
    add_area_light(
        "KYX_REV31_FILL",
        (-3.1, -1.5, 2.3),
        390.0,
        (0.34, 0.55, 0.74),
        3.1,
        (0.0, 0.0, 1.0),
    )
    add_area_light(
        "KYX_REV31_RIM",
        (1.0, 3.2, 3.3),
        670.0,
        (0.28, 0.68, 1.0),
        2.6,
        (0.0, 0.0, 1.18),
    )


def assign_idle(rig: bpy.types.Object) -> None:
    action = bpy.data.actions.get("KYX_REV17_TP_IDLE")
    if action is None:
        raise RuntimeError("Direct GLB import is missing KYX_REV17_TP_IDLE")
    animation_data = rig.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True
    animation_data.action = action
    rig.data.pose_position = "POSE"
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 49
    scene.frame_set(13)
    bpy.context.view_layer.update()


def assign_neutral(rig: bpy.types.Object) -> None:
    animation_data = rig.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True
    animation_data.action = None
    rig.data.pose_position = "REST"
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def weighted_head_fraction(obj: bpy.types.Object) -> float:
    head_group = obj.vertex_groups.get("head")
    if head_group is None or not obj.data.vertices:
        return 0.0
    weighted = 0
    for vertex in obj.data.vertices:
        for membership in vertex.groups:
            if membership.group == head_group.index and membership.weight > 0.999:
                weighted += 1
                break
    return weighted / len(obj.data.vertices)


def render_view(
    role: str,
    view: str,
    output: Path,
    scene: bpy.types.Scene,
    presentation: str,
) -> dict[str, Any]:
    spec = VIEWS[view]
    camera_data = bpy.data.cameras.new(name=f"KYX_REV31_{role}_{view}_CAMERA")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = spec["scale"]
    camera_data.lens = 72.0
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = spec["camera"]
    look_at(camera, Vector(spec["target"]))
    scene.camera = camera
    scene.render.stamp_note_text = (
        f"KYX REV31 ROLE FAMILY | {ROLE_LABELS[role]} | "
        f"{view.upper()} | {presentation.upper()} | EXACT RUNTIME GLB | "
        "HUMAN REVIEW REQUIRED"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    record = {
        "view": view,
        "presentation": presentation,
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "camera": {
            "location": list(spec["camera"]),
            "target": list(spec["target"]),
            "orthographicScale": spec["scale"],
        },
    }
    bpy.data.objects.remove(camera, do_unlink=True)
    return record


def inspect_role(role: str, glb: Path, evidence_dir: Path) -> dict[str, Any]:
    reset_scene()
    scene = configure_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"{role}: expected one armature, got {len(armatures)}")
    rig = armatures[0]
    assign_neutral(rig)
    role_token = role.upper()
    helmet_parts = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and f"REV31_{role_token}_" in obj.name
    ]
    if len(helmet_parts) < 12:
        raise RuntimeError(f"{role}: expected at least 12 helmet parts")
    rifle_meshes = []
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            if "RIFLE" in obj.name.upper():
                rifle_meshes.append(obj)
                obj.hide_render = True
    add_stage()
    action_set = {action.name for action in bpy.data.actions}
    missing_actions = sorted(EXPECTED_ACTIONS - action_set)
    head_weights = {
        obj.name: round(weighted_head_fraction(obj), 6) for obj in helmet_parts
    }
    armature_binding = {
        obj.name: any(
            modifier.type == "ARMATURE" and modifier.object == rig
            for modifier in obj.modifiers
        )
        for obj in helmet_parts
    }
    required_named_parts = {
        "cowl": any("ContinuousCyberCowl" in obj.name for obj in helmet_parts),
        "rearShell": any("RearShell" in obj.name for obj in helmet_parts),
        "crown": any("_Crown" in obj.name for obj in helmet_parts),
        "faceplate": any("_Faceplate" in obj.name for obj in helmet_parts),
        "visor": any(obj.name.endswith("_Visor") for obj in helmet_parts),
        "chin": any("_Chin" in obj.name for obj in helmet_parts),
        "neckSeal": any("NeckSeal" in obj.name for obj in helmet_parts),
        "leftTemple": any("Temple_L" in obj.name for obj in helmet_parts),
        "rightTemple": any("Temple_R" in obj.name for obj in helmet_parts),
        "leftCheek": any("Cheek_L" in obj.name for obj in helmet_parts),
        "rightCheek": any("Cheek_R" in obj.name for obj in helmet_parts),
    }
    render_records = []
    for view in VIEWS:
        render_records.append(
            render_view(
                role,
                view,
                evidence_dir / role / f"rev31-{role}-neutral-{view}.png",
                scene,
                "neutral-rest-pose",
            )
        )
    assign_idle(rig)
    for rifle_mesh in rifle_meshes:
        rifle_mesh.hide_render = False
    render_records.append(
        render_view(
            role,
            "three-quarter",
            evidence_dir
            / role
            / f"rev31-{role}-weapon-contact-three-quarter.png",
            scene,
            "inherited-rifle-contact-witness",
        )
    )
    assertions = {
        "oneArmature": len(armatures) == 1,
        "boneContract66": len(rig.data.bones) == 66,
        "allRequiredActionsPresent": not missing_actions,
        "allHelmetPartsArmatureBound": all(armature_binding.values()),
        "allHelmetVerticesRigidHeadWeighted": all(
            fraction == 1.0 for fraction in head_weights.values()
        ),
        "closedCoveragePartsPresent": all(required_named_parts.values()),
        "frontSideThreeQuarterNeutralRendered": len(
            [
                item
                for item in render_records
                if item["presentation"] == "neutral-rest-pose"
            ]
        )
        == 3,
        "weaponContactRenderedSeparately": any(
            item["presentation"] == "inherited-rifle-contact-witness"
            for item in render_records
        ),
    }
    return {
        "role": role,
        "glb": {
            "path": str(glb),
            "bytes": glb.stat().st_size,
            "sha256": sha256(glb),
        },
        "directImport": {
            "armature": rig.name,
            "bones": len(rig.data.bones),
            "actions": sorted(action_set),
            "missingRequiredActions": missing_actions,
            "helmetPartCount": len(helmet_parts),
            "helmetVertexCount": sum(
                len(obj.data.vertices) for obj in helmet_parts
            ),
            "helmetTriangleCount": sum(
                sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
                for obj in helmet_parts
            ),
            "armatureBinding": armature_binding,
            "headWeightFractions": head_weights,
            "requiredClosedCoverageParts": required_named_parts,
        },
        "renders": render_records,
        "assertions": assertions,
    }


def main() -> None:
    runtime_dir, evidence_dir, report_path = arguments()
    results = []
    for role in EXPECTED_ROLES:
        glb = runtime_dir / f"character-{role}-lod0.glb"
        if not glb.is_file():
            raise RuntimeError(f"Missing role runtime GLB: {glb}")
        results.append(inspect_role(role, glb, evidence_dir))
    assertions = {
        "fourRolesReimported": len(results) == 4,
        "allRoleAssertionsPass": all(
            all(result["assertions"].values()) for result in results
        ),
        "sixteenVisualViewsRendered": (
            sum(len(result["renders"]) for result in results) == 16
        ),
        "fourDistinctRuntimeHashes": len(
            {result["glb"]["sha256"] for result in results}
        )
        == 4,
    }
    report = {
        "schema": "kyx-g6-rev31-role-helmet-direct-glb-validation-v1",
        "checkpoint": "G6_REV31_ROLE_HELMET_FAMILY",
        "status": (
            "DIRECT_GLB_STRUCTURE_AND_VISUAL_PACKET_COMPLETE_"
            "HUMAN_REVIEW_REQUIRED"
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "roles": results,
        "assertions": assertions,
        "nonClaims": [
            "The direct GLB validation proves structure and sampled presentation, "
            "not human visual acceptance.",
            "The static front/side/three-quarter packet does not prove every-frame "
            "interpenetration freedom across all actions.",
            "Role-to-loadout selection remains a separate integration lane.",
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not all(assertions.values()):
        raise RuntimeError(f"Rev31 direct GLB validation failed: {assertions}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
