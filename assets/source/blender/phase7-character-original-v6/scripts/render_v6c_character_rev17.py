"""Render deterministic direct-GLB evidence for the isolated Rev17 candidate.

The exact supplied LOD0 GLB is fresh-imported.  Eight compass views expose the
full idle silhouette, while action views expose run weighting, rifle contact,
reload, airborne posture, and death settling.  Cameras, floor, and lights are
render-only.  The source GLB and imported runtime topology are hashed/snapshotted
before and after capture.  This evidence remains subject to human visual review.
"""

from __future__ import annotations

from array import array
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


CHECKPOINT = "G6_REV17_HUMAN_PROPORTIONED_CHARACTER_CANDIDATE"
STATUS = "REV17_DIRECT_GLB_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED_NOT_G6"
RENDER_PREFIX = "KYX_REV17_DIRECT_GLB_"
EXPECTED_CLIPS = {
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
    "KYX_REV17_FP_IDLE",
    "KYX_REV17_FP_FIRE",
    "KYX_REV17_FP_RELOAD",
    "KYX_REV17_FP_SPRINT",
    "KYX_REV17_FP_AIRBORNE",
    "KYX_REV17_FP_LAND",
}


def load_helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "render_v6c_lod0_retopo_rev14.py"
    )
    spec = importlib.util.spec_from_file_location("kyx_rev17_render_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load render helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RENDER_PREFIX = RENDER_PREFIX
    return module


HELPERS = load_helpers()


def pixel_repeat_difference(first: Path, repeat: Path) -> dict[str, Any]:
    """Measure decoded pixel equivalence across two deterministic renders.

    Eevee can vary a handful of decoded channels by a few 8-bit code values
    even after a warmup.  Record both the strict one-code comparison and a
    transparent bounded-renderer variance gate instead of treating a different
    compressed PNG hash as a geometry or camera change.
    """

    first_image = bpy.data.images.load(str(first), check_existing=False)
    repeat_image = bpy.data.images.load(str(repeat), check_existing=False)
    try:
        if tuple(first_image.size) != tuple(repeat_image.size):
            return {
                "sameDimensions": False,
                "maximumChannelDelta": 1.0,
                "meanChannelDelta": 1.0,
                "channelsAboveOneCodeValue": -1,
                "pixelEquivalentWithinOneCodeValue": False,
                "withinBoundedEeveeVariance": False,
            }
        length = len(first_image.pixels)
        first_pixels = array("f", [0.0]) * length
        repeat_pixels = array("f", [0.0]) * length
        first_image.pixels.foreach_get(first_pixels)
        repeat_image.pixels.foreach_get(repeat_pixels)
        maximum = 0.0
        total = 0.0
        above = 0
        tolerance = (1.0 / 255.0) + 1.0e-7
        for left, right in zip(first_pixels, repeat_pixels):
            delta = abs(float(left) - float(right))
            maximum = max(maximum, delta)
            total += delta
            if delta > tolerance:
                above += 1
        bounded_maximum = (5.0 / 255.0) + 1.0e-7
        bounded_mean = 2.0e-7
        bounded_channels = 32
        return {
            "sameDimensions": True,
            "maximumChannelDelta": maximum,
            "meanChannelDelta": total / max(1, length),
            "channelsAboveOneCodeValue": above,
            "pixelEquivalentWithinOneCodeValue": above == 0,
            "boundedEeveeVarianceContract": {
                "maximumChannelDelta": bounded_maximum,
                "maximumMeanChannelDelta": bounded_mean,
                "maximumChannelsAboveOneCodeValue": bounded_channels,
            },
            "withinBoundedEeveeVariance": (
                maximum <= bounded_maximum
                and (total / max(1, length)) <= bounded_mean
                and above <= bounded_channels
            ),
        }
    finally:
        bpy.data.images.remove(first_image)
        bpy.data.images.remove(repeat_image)


def script_args() -> tuple[Path, Path, Path, Path, str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <lod0.glb> <eight-view-dir> <action-dir> "
            "<report.json> <expected-sha256>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 5:
        raise SystemExit(f"Expected five arguments, got {len(values)}")
    return (
        Path(values[0]).resolve(),
        Path(values[1]).resolve(),
        Path(values[2]).resolve(),
        Path(values[3]).resolve(),
        values[4].strip().lower(),
    )


def target_for_view(
    spec: dict[str, Any],
    pose_minimum: Vector,
    pose_maximum: Vector,
    rig: bpy.types.Object,
    rifle: bpy.types.Object,
) -> tuple[Vector, float, dict[str, Any]]:
    center = (pose_minimum + pose_maximum) * 0.5
    height = pose_maximum.z - pose_minimum.z
    mode = spec["targetMode"]
    if mode == "contact":
        target, details = HELPERS.contact_target(rig, rifle)
        return target, float(spec["orthographicScale"]), details
    if mode == "torso":
        target = (
            rig.matrix_world @ rig.pose.bones["spine_02"].head
        ) + Vector((0.0, -0.04, 0.10))
        return target, float(spec["orthographicScale"]), {
            "target": HELPERS.vector_values(target),
            "purpose": "torso_pelvis_arm_clearance",
        }
    if mode == "boots":
        left = rig.matrix_world @ rig.pose.bones["foot_anchor.L"].head
        right = rig.matrix_world @ rig.pose.bones["foot_anchor.R"].head
        target = (left + right) * 0.5 + Vector((0.0, -0.07, 0.03))
        return target, float(spec["orthographicScale"]), {
            "target": HELPERS.vector_values(target),
            "purpose": "human_foot_boot_and_floor_contact",
        }
    target = center + Vector((0.0, -0.025, height * 0.015))
    return target, max(height * 1.18, 2.05), {
        "target": HELPERS.vector_values(target),
        "purpose": "full_silhouette",
    }


def render_view(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    runtime_meshes: list[bpy.types.Object],
    rifle: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
    output_dir: Path,
    spec: dict[str, Any],
) -> dict[str, Any]:
    action = actions[spec["action"]]
    HELPERS.assign_action(scene, rig, action, float(spec["frame"]))
    pose_minimum, pose_maximum = HELPERS.evaluated_bounds(runtime_meshes)
    target, scale, target_details = target_for_view(
        spec, pose_minimum, pose_maximum, rig, rifle
    )
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
        f"REV17 EXACT LOD0 GLB | {spec['label']} | {action.name} "
        f"f{int(spec['frame'])} | CANDIDATE ONLY | HUMAN REVIEW REQUIRED | NOT G6"
    )
    output = output_dir / f"kyx-v6c-character-rev17-{spec['name']}.png"
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
    hash_matches = first_hash == repeat_hash and first_bytes == repeat_bytes
    pixel_difference = pixel_repeat_difference(output, repeat)
    if pixel_difference["withinBoundedEeveeVariance"]:
        repeat.unlink()
    bpy.data.objects.remove(camera, do_unlink=True)
    return {
        "name": spec["name"],
        "label": spec["label"],
        "category": spec["category"],
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
            "orthographicScale": round(scale, 6),
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
            "matchesFirstRenderHashAndBytes": hash_matches,
            "decodedPixelDifference": pixel_difference,
            "repeatFileRemoved": not repeat.exists(),
        },
    }


def main() -> None:
    glb_path, eight_dir, action_dir, report_path, expected_sha = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
    if len(expected_sha) != 64:
        raise RuntimeError("Expected SHA-256 must have 64 hexadecimal characters")
    for path in (eight_dir, action_dir, report_path.parent):
        path.mkdir(parents=True, exist_ok=True)
    source_hash_before = HELPERS.sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
    if source_hash_before != expected_sha:
        raise RuntimeError(
            f"Rev17 LOD0 hash mismatch: {source_hash_before} != {expected_sha}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Fresh Rev17 import failed: {import_result}")
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
    if rig is None or len(rig.data.bones) != 66:
        raise RuntimeError("Fresh Rev17 import lacks the 66-joint rig/socket contract")
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != EXPECTED_CLIPS:
        raise RuntimeError(f"Rev17 clip contract mismatch: {sorted(actions)}")
    if len(runtime_meshes) != 3:
        raise RuntimeError(f"Expected three runtime meshes, got {len(runtime_meshes)}")
    rifle = next(
        (obj for obj in runtime_meshes if "RIFLE" in obj.name.upper()), None
    )
    if rifle is None:
        raise RuntimeError("Fresh Rev17 import contains no rifle role")
    topology_before = HELPERS.topology_snapshot(runtime_meshes)
    HELPERS.assign_action(
        bpy.context.scene, rig, actions["KYX_REV17_TP_IDLE"], 13.0
    )
    minimum, maximum = HELPERS.evaluated_bounds(runtime_meshes)
    render_configuration = HELPERS.configure_scene(
        bpy.context.scene, minimum, maximum
    )

    orbit_specs = (
        ("front", "FRONT", (0.0, 5.2, 1.10)),
        ("front-right", "FRONT RIGHT THREE-QUARTER", (3.8, 3.8, 1.15)),
        ("right", "RIGHT PROFILE", (5.2, 0.0, 1.10)),
        ("rear-right", "REAR RIGHT THREE-QUARTER", (3.8, -3.8, 1.15)),
        ("rear", "REAR", (0.0, -5.2, 1.10)),
        ("rear-left", "REAR LEFT THREE-QUARTER", (-3.8, -3.8, 1.15)),
        ("left", "LEFT PROFILE", (-5.2, 0.0, 1.10)),
        ("front-left", "FRONT LEFT THREE-QUARTER", (-3.8, 3.8, 1.15)),
    )
    eight_specs = [
        {
            "name": f"eight-view-{name}",
            "label": label,
            "category": "deterministic-eight-view",
            "action": "KYX_REV17_TP_IDLE",
            "frame": 13,
            "targetMode": "full",
            "cameraOffset": offset,
            "resolution": (1100, 1400),
        }
        for name, label, offset in orbit_specs
    ]
    action_specs = (
        {
            "name": "action-run-left-lead",
            "label": "WEIGHTED RUN / LEFT LEAD",
            "category": "action",
            "action": "KYX_REV17_TP_RUN",
            "frame": 1,
            "targetMode": "full",
            "cameraOffset": (3.6, -4.5, 1.15),
            "resolution": (1200, 1400),
        },
        {
            "name": "action-run-right-lead",
            "label": "WEIGHTED RUN / RIGHT LEAD",
            "category": "action",
            "action": "KYX_REV17_TP_RUN",
            "frame": 10,
            "targetMode": "full",
            "cameraOffset": (3.6, -4.5, 1.15),
            "resolution": (1200, 1400),
        },
        {
            "name": "action-fire-contact-right",
            "label": "PRIMARY FIRE / FIRING-HAND CONTACT",
            "category": "contact",
            "action": "KYX_REV17_TP_PRIMARY_FIRE",
            "frame": 5,
            "targetMode": "contact",
            "cameraOffset": (2.20, -3.30, 0.78),
            "orthographicScale": 0.78,
            "resolution": (1500, 1050),
        },
        {
            "name": "action-support-contact-left",
            "label": "IDLE / SUPPORT-HAND CONTACT",
            "category": "contact",
            "action": "KYX_REV17_TP_IDLE",
            "frame": 13,
            "targetMode": "contact",
            "cameraOffset": (-2.20, -3.30, 0.78),
            "orthographicScale": 0.78,
            "resolution": (1500, 1050),
        },
        {
            "name": "action-reload-midpoint",
            "label": "RELOAD / MIDPOINT",
            "category": "action",
            "action": "KYX_REV17_TP_RELOAD",
            "frame": 25,
            "targetMode": "torso",
            "cameraOffset": (3.2, -4.2, 1.0),
            "orthographicScale": 1.35,
            "resolution": (1350, 1200),
        },
        {
            "name": "action-airborne",
            "label": "AIRBORNE LOOP / WEIGHTED TUCK",
            "category": "action",
            "action": "KYX_REV17_TP_AIRBORNE_LOOP",
            "frame": 13,
            "targetMode": "full",
            "cameraOffset": (3.6, -4.5, 1.15),
            "resolution": (1200, 1400),
        },
        {
            "name": "action-death-settle",
            "label": "DEATH FRONT / SETTLE",
            "category": "action",
            "action": "KYX_REV17_TP_DEATH_FRONT",
            "frame": 60,
            "targetMode": "full",
            "cameraOffset": (3.6, -4.5, 1.15),
            "resolution": (1400, 1100),
        },
        {
            "name": "detail-boots-floor-contact",
            "label": "BOOTS / HUMAN FOOT / FLOOR CONTACT",
            "category": "detail",
            "action": "KYX_REV17_TP_IDLE",
            "frame": 13,
            "targetMode": "boots",
            "cameraOffset": (2.2, -3.1, 0.46),
            "orthographicScale": 0.70,
            "resolution": (1500, 1050),
        },
    )
    eight_views = [
        render_view(
            bpy.context.scene,
            rig,
            runtime_meshes,
            rifle,
            actions,
            eight_dir,
            spec,
        )
        for spec in eight_specs
    ]
    action_views = [
        render_view(
            bpy.context.scene,
            rig,
            runtime_meshes,
            rifle,
            actions,
            action_dir,
            spec,
        )
        for spec in action_specs
    ]
    topology_after = HELPERS.topology_snapshot(runtime_meshes)
    source_hash_after = HELPERS.sha256(glb_path)
    source_bytes_after = glb_path.stat().st_size
    all_views = [*eight_views, *action_views]
    assertions = {
        "exactGlbHashAndBytesUnchanged": (
            source_hash_before == source_hash_after == expected_sha
            and source_bytes_before == source_bytes_after
        ),
        "freshImportHasThreeRuntimeMeshes": len(runtime_meshes) == 3,
        "freshImportHasSingle66JointRig": (
            len(rigs) == 1 and len(rig.data.bones) == 66
        ),
        "allSixteenClipsPresent": set(actions) == EXPECTED_CLIPS,
        "allEightCompassViewsRendered": (
            len(eight_views) == 8
            and all(Path(view["path"]).is_file() for view in eight_views)
        ),
        "allRepresentativeActionViewsRendered": (
            len(action_views) == 8
            and all(Path(view["path"]).is_file() for view in action_views)
        ),
        "everyMeasuredRepeatWithinBoundedEeveeVariance": all(
            view["determinismRepeat"]["decodedPixelDifference"][
                "withinBoundedEeveeVariance"
            ]
            for view in all_views
        ),
        "runtimeTopologyUnchangedAcrossCapture": topology_before == topology_after,
    }
    report = {
        "schema": "kyx-g6-rev17-direct-glb-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS if all(assertions.values()) else "REV17_RENDER_ASSERTION_FAILURE",
        "candidateDisposition": {
            "default": False,
            "releaseEligible": False,
            "g6Accepted": False,
            "humanVisualReviewRequired": True,
        },
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
            "armature": rig.name,
            "boneCount": len(rig.data.bones),
            "socketBones": sorted(
                bone.name
                for bone in rig.data.bones
                if bone.name.startswith("socket_")
            ),
            "actions": sorted(actions),
            "topologyBefore": topology_before,
            "topologyAfter": topology_after,
        },
        "renderConfiguration": render_configuration,
        "eightView": eight_views,
        "representativeActions": action_views,
        "assertions": assertions,
        "visualDecision": "PENDING_EXPLICIT_HUMAN_REVIEW_NOT_G6",
        "nonClaims": [
            "Deterministic images and clean structure do not grant visual acceptance.",
            "Eevee repeat renders are accepted only within the recorded five-code-value, 32-channel, 2e-7 mean decoded-pixel variance bound; exact PNG hashes are not claimed.",
            "Sampled poses do not prove every-frame clipping freedom.",
            "Runtime screenshots and 2/4/8 population performance are separate evidence.",
            "Rev17 is not promoted to the default soldier asset.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": report["status"],
                "sourceSha256": source_hash_before,
                "eightViewCount": len(eight_views),
                "actionViewCount": len(action_views),
                "allRepeatsWithinBoundedEeveeVariance": assertions[
                    "everyMeasuredRepeatWithinBoundedEeveeVariance"
                ],
                "topologyUnchanged": assertions[
                    "runtimeTopologyUnchangedAcrossCapture"
                ],
                "report": str(report_path),
            },
            indent=2,
        )
    )
    if not all(assertions.values()):
        raise RuntimeError(f"Rev17 render assertions failed: {assertions}")


if __name__ == "__main__":
    main()
