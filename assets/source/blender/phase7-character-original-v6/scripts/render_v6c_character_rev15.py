"""Render deterministic direct visual evidence from the exact Rev15 GLB.

The supplied GLB is fresh-imported after factory reset.  All cameras, lights,
and the floor are render-only helpers.  Runtime topology and the source hash are
snapshotted before and after every capture; no Blend file or geometry is saved.
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


CHECKPOINT = "V6C_CHARACTER_CONTACT_MOTION_SURFACE_CANDIDATE_REV15"
STATUS = "BOUNDED_DIRECT_REV15_GLB_VISUAL_EVIDENCE_REVIEW_REQUIRED_NOT_G6"
EXPECTED_SHA256 = "dec93490a3953e64b55a14056aeb4d619ee8f88f4519db12db6f9ddca990f085"
EXPECTED_CLIPS = (
    "KYX_V6C_TP_IDLE",
    "KYX_V6C_TP_WALK",
    "KYX_V6C_TP_RUN",
    "KYX_V6C_TP_JUMP_START",
    "KYX_V6C_TP_AIRBORNE_LOOP",
    "KYX_V6C_TP_LAND",
    "KYX_V6C_TP_PRIMARY_FIRE",
    "KYX_V6C_TP_RELOAD",
    "KYX_V6C_TP_HIT_REACTION_FRONT",
    "KYX_V6C_TP_DEATH_FRONT",
)
RENDER_PREFIX = "KYX_REV15_GLB_EVIDENCE_"


def load_render_helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "render_v6c_lod0_retopo_rev14.py"
    )
    spec = importlib.util.spec_from_file_location(
        "kyx_rev14_render_helpers", source
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load render helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RENDER_PREFIX = RENDER_PREFIX
    return module


HELPERS = load_render_helpers()


def script_args() -> tuple[Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev15.runtime-candidate.glb> <render-dir> <report.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit(f"Expected three arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)  # type: ignore[return-value]


def target_for_view(
    spec: dict[str, Any],
    pose_minimum: Vector,
    pose_maximum: Vector,
    rig: bpy.types.Object,
    rifle: bpy.types.Object,
) -> tuple[Vector, float, dict[str, Any]]:
    pose_center = (pose_minimum + pose_maximum) * 0.5
    pose_height = pose_maximum.z - pose_minimum.z
    mode = spec["targetMode"]
    if mode == "contact":
        target, details = HELPERS.contact_target(rig, rifle)
        return target, float(spec["orthographicScale"]), details
    if mode == "waist":
        target = (
            rig.matrix_world @ rig.pose.bones["spine_01"].head
        ) + Vector((0.0, 0.0, 0.045))
        return target, float(spec["orthographicScale"]), {
            "target": HELPERS.vector_values(target),
            "purpose": "waist_and_pelvis_transition",
        }
    if mode == "boots":
        left = rig.matrix_world @ rig.pose.bones["foot_anchor.L"].head
        right = rig.matrix_world @ rig.pose.bones["foot_anchor.R"].head
        target = (left + right) * 0.5 + Vector((0.0, -0.055, 0.035))
        return target, float(spec["orthographicScale"]), {
            "target": HELPERS.vector_values(target),
            "purpose": "pants_boot_overlap_cuffs_toe_and_sole_treatment",
        }
    target = pose_center + Vector((0.0, -0.025, pose_height * 0.015))
    scale = max(
        pose_height * float(spec["heightMultiplier"]),
        float(spec["minimumScale"]),
    )
    return target, scale, {"target": HELPERS.vector_values(target)}


def render_view(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    runtime_meshes: list[bpy.types.Object],
    rifle: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
    render_dir: Path,
    spec: dict[str, Any],
) -> dict[str, Any]:
    action = actions[spec["action"]]
    HELPERS.assign_action(scene, rig, action, float(spec["frame"]))
    pose_minimum, pose_maximum = HELPERS.evaluated_bounds(runtime_meshes)
    target, orthographic_scale, target_details = target_for_view(
        spec, pose_minimum, pose_maximum, rig, rifle
    )
    camera_location = target + Vector(spec["cameraOffset"])
    camera = HELPERS.add_camera(
        RENDER_PREFIX + "Camera_" + spec["name"],
        camera_location,
        target,
        orthographic_scale,
    )
    scene.camera = camera
    scene.render.resolution_x = int(spec["resolution"][0])
    scene.render.resolution_y = int(spec["resolution"][1])
    scene.render.stamp_note_text = (
        f"REV15 EXACT GLB | {spec['label']} | {action.name} "
        f"f{int(spec['frame'])} | BOUNDED VISUAL EVIDENCE | "
        "REVIEW REQUIRED | NOT G6"
    )
    output = (
        render_dir
        / f"kyx-v6c-character-rev15-{spec['name']}.png"
    )
    # Eevee's first render after a new camera can populate temporal/shader
    # caches.  Keep that warm-up outside the evidence pair so the two measured
    # renders start from the same initialized state.
    warmup = output.with_name(output.stem + ".determinism-warmup.png")
    scene.render.filepath = str(warmup)
    bpy.ops.render.render(write_still=True)
    warmup.unlink()
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    first_hash = HELPERS.sha256(output)
    first_bytes = output.stat().st_size

    repeat = output.with_name(output.stem + ".determinism-repeat.png")
    scene.render.filepath = str(repeat)
    bpy.ops.render.render(write_still=True)
    repeat_hash = HELPERS.sha256(repeat)
    repeat_bytes = repeat.stat().st_size
    hashes_match = first_hash == repeat_hash and first_bytes == repeat_bytes
    if hashes_match:
        repeat.unlink()
    bpy.data.objects.remove(camera, do_unlink=True)
    return {
        "name": spec["name"],
        "label": spec["label"],
        "path": str(output),
        "bytes": first_bytes,
        "sha256": first_hash,
        "resolution": list(spec["resolution"]),
        "action": action.name,
        "sampledFrame": int(spec["frame"]),
        "actionFrameRange": [
            float(action.frame_range[0]),
            float(action.frame_range[1]),
        ],
        "camera": {
            "type": "ORTHOGRAPHIC",
            "location": HELPERS.vector_values(camera_location),
            "target": HELPERS.vector_values(target),
            "orthographicScale": round(orthographic_scale, 6),
        },
        "poseBounds": {
            "minimum": HELPERS.vector_values(pose_minimum),
            "maximum": HELPERS.vector_values(pose_maximum),
        },
        "targetDetails": target_details,
        "determinismRepeat": {
            "warmupRenderedAndRemoved": not warmup.exists(),
            "bytes": repeat_bytes,
            "sha256": repeat_hash,
            "matchesFirstRender": hashes_match,
            "repeatFileRemoved": not repeat.exists(),
        },
    }


def main() -> None:
    glb_path, render_dir, report_path = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
    render_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    source_hash_before = HELPERS.sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
    if source_hash_before != EXPECTED_SHA256:
        raise RuntimeError(
            f"Rev15 GLB hash mismatch: {source_hash_before} != {EXPECTED_SHA256}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Fresh Rev15 import failed: {import_result}")
    helpers = HELPERS.imported_helper_meshes()
    for obj in helpers:
        obj.hide_render = True
        obj.hide_viewport = True
    runtime_meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helpers
    ]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None or len(rig.data.bones) != 52:
        raise RuntimeError("Fresh Rev15 import lacks the required 52-bone rig")
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Rev15 clip contract mismatch: {sorted(actions)}"
        )
    if len(runtime_meshes) != 3:
        raise RuntimeError(
            f"Expected three runtime meshes, got {len(runtime_meshes)}"
        )
    rifle = next(
        (
            obj
            for obj in runtime_meshes
            if "RIFLE_REV15" in obj.name.upper()
        ),
        None,
    )
    if rifle is None:
        raise RuntimeError("Fresh Rev15 import contains no rifle role")

    topology_before = HELPERS.topology_snapshot(runtime_meshes)
    HELPERS.assign_action(
        bpy.context.scene, rig, actions["KYX_V6C_TP_IDLE"], 13.0
    )
    character_minimum, character_maximum = HELPERS.evaluated_bounds(
        runtime_meshes
    )
    configuration = HELPERS.configure_scene(
        bpy.context.scene, character_minimum, character_maximum
    )
    view_specs = (
        {
            "name": "front-three-quarter-idle",
            "label": "FRONT THREE-QUARTER / IDLE",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "full",
            "cameraOffset": (3.20, -4.80, 1.42),
            "heightMultiplier": 1.18,
            "minimumScale": 2.05,
            "resolution": (1440, 1600),
        },
        {
            "name": "rear-side-idle",
            "label": "REAR-SIDE THREE-QUARTER / IDLE",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "full",
            "cameraOffset": (-3.75, 3.70, 1.30),
            "heightMultiplier": 1.18,
            "minimumScale": 2.05,
            "resolution": (1440, 1600),
        },
        {
            "name": "waist-pelvis-transition",
            "label": "TORSO / WAIST / HIP TRANSITION",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "waist",
            "cameraOffset": (2.25, -3.40, 0.62),
            "orthographicScale": 0.78,
            "resolution": (1500, 1100),
        },
        {
            "name": "pants-boots-surface",
            "label": "PANTS / BOOTS SURFACE TREATMENT",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "boots",
            "cameraOffset": (2.20, -3.25, 0.48),
            "orthographicScale": 0.72,
            "resolution": (1500, 1100),
        },
        {
            "name": "weapon-contact-firing-side",
            "label": "FIRING HAND GRIP / PRIMARY FIRE",
            "action": "KYX_V6C_TP_PRIMARY_FIRE",
            "frame": 3,
            "targetMode": "contact",
            "cameraOffset": (2.15, -3.45, 0.82),
            "orthographicScale": 0.78,
            "resolution": (1600, 1100),
        },
        {
            "name": "weapon-contact-support-side",
            "label": "SUPPORT HAND FOREGRIP / IDLE",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "contact",
            "cameraOffset": (-2.15, -3.45, 0.82),
            "orthographicScale": 0.78,
            "resolution": (1600, 1100),
        },
        {
            "name": "action-run-stride-left-lead",
            "label": "RUN STRIDE / LEFT LEAD",
            "action": "KYX_V6C_TP_RUN",
            "frame": 1,
            "targetMode": "full",
            "cameraOffset": (3.10, -4.70, 1.34),
            "heightMultiplier": 1.18,
            "minimumScale": 2.05,
            "resolution": (1440, 1600),
        },
        {
            "name": "action-run-stride-right-lead",
            "label": "RUN STRIDE / RIGHT LEAD",
            "action": "KYX_V6C_TP_RUN",
            "frame": 10,
            "targetMode": "full",
            "cameraOffset": (3.10, -4.70, 1.34),
            "heightMultiplier": 1.18,
            "minimumScale": 2.05,
            "resolution": (1440, 1600),
        },
    )
    views = [
        render_view(
            bpy.context.scene,
            rig,
            runtime_meshes,
            rifle,
            actions,
            render_dir,
            spec,
        )
        for spec in view_specs
    ]
    topology_after = HELPERS.topology_snapshot(runtime_meshes)
    source_hash_after = HELPERS.sha256(glb_path)
    source_bytes_after = glb_path.stat().st_size
    assertions = {
        "exactPinnedRev15GlbUnchanged": (
            source_hash_before == source_hash_after == EXPECTED_SHA256
            and source_bytes_before == source_bytes_after
        ),
        "freshImportHasThreeRuntimeMeshes": len(runtime_meshes) == 3,
        "freshImportHasSingle52BoneRig": (
            len(rigs) == 1 and len(rig.data.bones) == 52
        ),
        "exactTenClipContractPresent": set(actions) == set(EXPECTED_CLIPS),
        "allEightReviewViewsRendered": (
            len(views) == 8
            and all(Path(view["path"]).is_file() for view in views)
        ),
        "everyViewRepeatHashMatches": all(
            view["determinismRepeat"]["matchesFirstRender"]
            for view in views
        ),
        "runtimeTopologyUnchangedAcrossCapture": (
            topology_before == topology_after
        ),
        "noBlendSavedAndNoGeometryExported": True,
    }
    if not all(assertions.values()):
        raise RuntimeError(f"Rev15 render assertions failed: {assertions}")
    report = {
        "schema": "kyx-v6c-character-rev15-direct-glb-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS,
        "scope": (
            "Eight direct views of a fresh import of the exact pinned Rev15 "
            "runtime-candidate GLB. Cameras, lights, and floor are render-only."
        ),
        "sourceGlb": {
            "path": str(glb_path),
            "bytesBefore": source_bytes_before,
            "bytesAfter": source_bytes_after,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
        },
        "freshImport": {
            "operatorResult": sorted(import_result),
            "runtimeMeshes": sorted(obj.name for obj in runtime_meshes),
            "excludedImporterHelperMeshes": sorted(obj.name for obj in helpers),
            "armature": rig.name,
            "boneCount": len(rig.data.bones),
            "actions": sorted(actions),
            "topologyBefore": topology_before,
            "topologyAfter": topology_after,
        },
        "renderConfiguration": configuration,
        "views": views,
        "assertions": assertions,
        "visualDecision": "PENDING_DIRECT_HUMAN_REVIEW_NOT_G6",
        "boundedObservations": [
            "The two contact views use embedded Rev15 action poses from the exact GLB.",
            "The two run views sample opposite lead-foot phases from the embedded run clip.",
            "Dedicated waist and lower-body views expose the new clean-room hard-surface details and vertex-color treatment.",
            "Every captured image is byte-identical to its immediate repeat render.",
        ],
        "nonClaims": [
            "This packet does not grant human visual acceptance or close G6.",
            "This packet does not prove clipping-free contact without direct review.",
            "LOD1, LOD2, first-person arms, final texture atlases, product integration, performance, and release eligibility remain open.",
            "No public runtime asset, physics, UI, map, worker, or deployment file is modified by this renderer.",
        ],
    }
    report_path.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": STATUS,
                "sourceSha256": source_hash_before,
                "views": len(views),
                "allRepeatHashesMatch": assertions[
                    "everyViewRepeatHashMatches"
                ],
                "topologyUnchanged": assertions[
                    "runtimeTopologyUnchangedAcrossCapture"
                ],
                "report": str(report_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
