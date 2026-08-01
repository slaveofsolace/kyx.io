"""Render a bounded direct-GLB review packet for KYX Assault Rev32.

The exact LOD0 candidate is imported into a factory-empty Blender scene. The
packet covers silhouette, helmet/visor integration, torso flow, footwear, and
two locomotion poses. It is evidence for human review, never visual approval.
"""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


CHECKPOINT = "G6_ASSAULT_REV32_DIRECT_GLB_REVIEW"
STATUS = "REVIEW_PACKET_COMPLETE_EXPLICIT_HUMAN_DECISION_REQUIRED_NOT_G6"
RENDER_PREFIX = "KYX_REV32_REVIEW_"
EXPECTED_CLIPS = {
    "KYX_REV17_FP_AIRBORNE",
    "KYX_REV17_FP_FIRE",
    "KYX_REV17_FP_IDLE",
    "KYX_REV17_FP_LAND",
    "KYX_REV17_FP_RELOAD",
    "KYX_REV17_FP_SPRINT",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_DEATH_FRONT",
    "KYX_REV17_TP_HIT_REACTION_FRONT",
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_JUMP_START",
    "KYX_REV17_TP_LAND",
    "KYX_REV17_TP_PRIMARY_FIRE",
    "KYX_REV17_TP_RELOAD",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_WALK",
}


def helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "render_v6c_lod0_retopo_rev14.py"
    )
    spec = importlib.util.spec_from_file_location("kyx_rev32_review_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load render helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RENDER_PREFIX = RENDER_PREFIX
    return module


HELPERS = helpers()


def script_args() -> tuple[Path, Path, Path, str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <lod0.glb> <review-dir> <report.json> <expected-sha256>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 4:
        raise SystemExit(f"Expected four arguments, got {len(values)}")
    return (
        Path(values[0]).resolve(),
        Path(values[1]).resolve(),
        Path(values[2]).resolve(),
        values[3].strip().lower(),
    )


def target_for(
    spec: dict[str, Any],
    pose_minimum: Vector,
    pose_maximum: Vector,
    rig: bpy.types.Object,
) -> tuple[Vector, float, str]:
    mode = spec["targetMode"]
    if mode == "helmet":
        target = rig.matrix_world @ rig.pose.bones["head"].head
        return target + Vector((0.0, -0.025, 0.015)), float(spec["scale"]), "helmet_visor_integration"
    if mode == "torso":
        target = rig.matrix_world @ rig.pose.bones["spine_02"].head
        return target + Vector((0.0, -0.035, 0.06)), float(spec["scale"]), "connected_armor_material_flow"
    if mode == "boots":
        left = rig.matrix_world @ rig.pose.bones["foot_anchor.L"].head
        right = rig.matrix_world @ rig.pose.bones["foot_anchor.R"].head
        return (left + right) * 0.5 + Vector((0.0, -0.045, 0.035)), float(spec["scale"]), "footwear_alignment_floor_contact"
    center = (pose_minimum + pose_maximum) * 0.5
    height = pose_maximum.z - pose_minimum.z
    return center + Vector((0.0, -0.025, height * 0.015)), max(height * 1.18, 2.05), "full_silhouette"


def render_one(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    meshes: list[bpy.types.Object],
    actions: dict[str, bpy.types.Action],
    output_dir: Path,
    spec: dict[str, Any],
) -> dict[str, Any]:
    action_name = spec.get("action")
    action = actions[action_name] if action_name is not None else None
    if action is None:
        rig.data.pose_position = "REST"
        scene.frame_set(1)
    else:
        rig.data.pose_position = "POSE"
        HELPERS.assign_action(scene, rig, action, float(spec["frame"]))
    pose_minimum, pose_maximum = HELPERS.evaluated_bounds(meshes)
    target, scale, purpose = target_for(spec, pose_minimum, pose_maximum, rig)
    camera_location = target + Vector(spec["cameraOffset"])
    camera = HELPERS.add_camera(
        RENDER_PREFIX + "Camera_" + spec["name"],
        camera_location,
        target,
        scale,
    )
    scene.camera = camera
    scene.render.resolution_x = int(spec["resolution"][0])
    scene.render.resolution_y = int(spec["resolution"][1])
    scene.render.stamp_note_text = (
        f"ASSAULT REV32 EXACT LOD0 | {spec['label']} | "
        f"{action.name if action is not None else 'RIG REST POSE'} "
        f"f{int(spec['frame'])} | REVIEW ONLY | HUMAN DECISION REQUIRED | NOT G6"
    )
    output = output_dir / f"kyx-assault-rev32-{spec['name']}.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    record = {
        "name": spec["name"],
        "label": spec["label"],
        "purpose": purpose,
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": HELPERS.sha256(output),
        "resolution": list(spec["resolution"]),
        "action": action.name if action is not None else None,
        "sampledFrame": int(spec["frame"]),
        "camera": {
            "location": HELPERS.vector_values(camera_location),
            "target": HELPERS.vector_values(target),
            "orthographicScale": round(scale, 6),
        },
        "poseBounds": {
            "minimum": HELPERS.vector_values(pose_minimum),
            "maximum": HELPERS.vector_values(pose_maximum),
        },
    }
    bpy.data.objects.remove(camera, do_unlink=True)
    return record


def main() -> None:
    glb_path, output_dir, report_path, expected_sha = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    source_hash_before = HELPERS.sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
    if source_hash_before != expected_sha:
        raise RuntimeError(
            f"Rev32 LOD0 hash mismatch: {source_hash_before} != {expected_sha}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Fresh Rev32 import failed: {import_result}")
    helper_meshes = HELPERS.imported_helper_meshes()
    for helper in helper_meshes:
        helper.hide_render = True
        helper.hide_viewport = True
    runtime_meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helper_meshes
    ]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda item: len(item.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh Rev32 import contains no armature")
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != EXPECTED_CLIPS:
        raise RuntimeError(f"Rev32 clip contract mismatch: {sorted(actions)}")
    if len(runtime_meshes) != 2:
        raise RuntimeError(f"Expected two runtime meshes, got {len(runtime_meshes)}")
    if any("RIFLE" in obj.name.upper() or "WEAPON" in obj.name.upper() for obj in runtime_meshes):
        raise RuntimeError("Rev32 base character unexpectedly embeds a weapon mesh")

    topology_before = HELPERS.topology_snapshot(runtime_meshes)
    rig.data.pose_position = "REST"
    bpy.context.scene.frame_set(1)
    minimum, maximum = HELPERS.evaluated_bounds(runtime_meshes)
    render_configuration = HELPERS.configure_scene(
        bpy.context.scene, minimum, maximum
    )
    specs = (
        {"name": "full-front", "label": "FULL FRONT", "action": None, "frame": 1, "targetMode": "full", "cameraOffset": (0.0, 5.2, 1.10), "resolution": (1100, 1400)},
        {"name": "full-three-quarter", "label": "FRONT THREE-QUARTER", "action": None, "frame": 1, "targetMode": "full", "cameraOffset": (3.8, 3.8, 1.15), "resolution": (1100, 1400)},
        {"name": "full-side", "label": "RIGHT PROFILE", "action": None, "frame": 1, "targetMode": "full", "cameraOffset": (5.2, 0.0, 1.10), "resolution": (1100, 1400)},
        {"name": "full-rear", "label": "FULL REAR", "action": None, "frame": 1, "targetMode": "full", "cameraOffset": (0.0, -5.2, 1.10), "resolution": (1100, 1400)},
        {"name": "helmet-front", "label": "HELMET + VISOR FRONT", "action": None, "frame": 1, "targetMode": "helmet", "cameraOffset": (0.0, 3.5, 0.25), "scale": 0.58, "resolution": (1250, 1050)},
        {"name": "helmet-three-quarter", "label": "HELMET + VISOR THREE-QUARTER", "action": None, "frame": 1, "targetMode": "helmet", "cameraOffset": (2.7, 3.1, 0.28), "scale": 0.62, "resolution": (1250, 1050)},
        {"name": "torso-front", "label": "CONNECTED TORSO ARMOR", "action": None, "frame": 1, "targetMode": "torso", "cameraOffset": (0.0, 3.8, 0.35), "scale": 1.04, "resolution": (1250, 1100)},
        {"name": "boots-front", "label": "BOOTS + FLOOR CONTACT", "action": None, "frame": 1, "targetMode": "boots", "cameraOffset": (0.0, 3.2, 0.28), "scale": 0.66, "resolution": (1250, 950)},
        {"name": "run-left-lead", "label": "RUN LEFT LEAD", "action": "KYX_REV17_TP_RUN", "frame": 1, "targetMode": "full", "cameraOffset": (3.8, 3.8, 1.15), "resolution": (1100, 1400)},
        {"name": "airborne", "label": "AIRBORNE LOOP", "action": "KYX_REV17_TP_AIRBORNE_LOOP", "frame": 13, "targetMode": "full", "cameraOffset": (3.8, 3.8, 1.15), "resolution": (1100, 1400)},
    )
    renders = [
        render_one(
            bpy.context.scene,
            rig,
            runtime_meshes,
            actions,
            output_dir,
            spec,
        )
        for spec in specs
    ]
    topology_after = HELPERS.topology_snapshot(runtime_meshes)
    source_hash_after = HELPERS.sha256(glb_path)
    assertions = {
        "exactGlbHashAndBytesUnchanged": source_hash_before == source_hash_after == expected_sha and source_bytes_before == glb_path.stat().st_size,
        "freshImportHasTwoRuntimeMeshes": len(runtime_meshes) == 2,
        "freshImportHasSingle66JointRig": len(rigs) == 1 and len(rig.data.bones) == 66,
        "allSixteenClipsPresent": set(actions) == EXPECTED_CLIPS,
        "noEmbeddedWeaponMesh": not any("RIFLE" in obj.name.upper() or "WEAPON" in obj.name.upper() for obj in runtime_meshes),
        "allReviewViewsRendered": len(renders) == len(specs) and all(Path(item["path"]).is_file() for item in renders),
        "runtimeTopologyUnchangedAcrossCapture": topology_before == topology_after,
    }
    report = {
        "schema": "kyx-g6-assault-rev32-direct-glb-review-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS if all(assertions.values()) else "REV32_REVIEW_ASSERTION_FAILURE",
        "candidateDisposition": {"default": False, "releaseEligible": False, "g6Accepted": False, "humanVisualReviewRequired": True},
        "sourceGlb": {"path": str(glb_path), "bytes": source_bytes_before, "sha256Before": source_hash_before, "sha256After": source_hash_after},
        "freshImport": {"runtimeMeshes": sorted(obj.name for obj in runtime_meshes), "armature": rig.name, "boneCount": len(rig.data.bones), "actions": sorted(actions), "topologyBefore": topology_before, "topologyAfter": topology_after},
        "renderConfiguration": render_configuration,
        "renders": renders,
        "assertions": assertions,
        "visualDecision": "PENDING_EXPLICIT_HUMAN_REVIEW_NOT_G6",
        "nonClaims": [
            "Rendered images and structural assertions do not grant visual acceptance.",
            "Sampled poses do not prove every-frame clipping freedom.",
            "Weapon contact is intentionally outside this weapon-free base character export.",
            "First-person arms, browser runtime selection, compression, and package budget remain open.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "renderCount": len(renders), "report": str(report_path)}, indent=2))
    if not all(assertions.values()):
        raise RuntimeError(f"Rev32 review assertions failed: {assertions}")


if __name__ == "__main__":
    main()
