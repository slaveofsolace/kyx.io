"""Render direct-GLB Rev18 eight-view and dynamic contact evidence.

The exact exported LOD0 and melee-proof GLBs are each fresh-imported.  Cameras,
lights, floor, and stamps are render-only and never enter the source assets.
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


CHECKPOINT = "G6_REV18_CHARACTER_REMEDIATION_SLICE"
RENDER_PREFIX = "KYX_REV18_DIRECT_GLB_"


def load_helpers() -> Any:
    source = Path(__file__).resolve().with_name("render_v6c_lod0_retopo_rev14.py")
    spec = importlib.util.spec_from_file_location("kyx_rev18_render_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load render helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RENDER_PREFIX = RENDER_PREFIX
    return module


HELPERS = load_helpers()


def script_args() -> tuple[Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <lod0.glb> <melee-proof.glb> <evidence-root>")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit(f"Expected three arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)  # type: ignore[return-value]


def runtime_import(path: Path) -> dict[str, Any]:
    source_hash = HELPERS.sha256(path)
    source_bytes = path.stat().st_size
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to import Rev18 GLB: {path}: {result}")
    helper_meshes = HELPERS.imported_helper_meshes()
    for helper in helper_meshes:
        helper.hide_render = True
        helper.hide_viewport = True
    meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helper_meshes
    ]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda item: len(item.data.bones), default=None)
    if rig is None or len(meshes) != 3:
        raise RuntimeError(
            f"Rev18 runtime import mismatch: rig={rig}, meshes={[obj.name for obj in meshes]}"
        )
    actions = {action.name: action for action in bpy.data.actions}
    return {
        "path": path,
        "hash": source_hash,
        "bytes": source_bytes,
        "operatorResult": sorted(result),
        "meshes": meshes,
        "rig": rig,
        "actions": actions,
        "helperMeshes": helper_meshes,
        "topology": HELPERS.topology_snapshot(meshes),
    }


def render_pose(
    imported: dict[str, Any],
    output: Path,
    *,
    action_name: str,
    frame: int,
    label: str,
    camera_offset: tuple[float, float, float],
    resolution: tuple[int, int],
    orthographic_scale: float | None = None,
    target_mode: str = "full",
) -> dict[str, Any]:
    scene = bpy.context.scene
    rig = imported["rig"]
    meshes = imported["meshes"]
    action = imported["actions"][action_name]
    HELPERS.assign_action(scene, rig, action, float(frame))
    pose_minimum, pose_maximum = HELPERS.evaluated_bounds(meshes)
    pose_center = (pose_minimum + pose_maximum) * 0.5
    pose_height = pose_maximum.z - pose_minimum.z
    if target_mode == "contact":
        bone = rig.pose.bones.get("socket_melee") or rig.pose.bones.get("palm.R")
        if bone is None:
            raise RuntimeError("Rev18 contact render cannot resolve melee/palm socket")
        target = rig.matrix_world @ bone.head
        scale = orthographic_scale or 0.62
    else:
        target = pose_center + Vector((0.0, -0.02, pose_height * 0.015))
        scale = orthographic_scale or max(pose_height * 1.13, 1.95)
    camera_location = target + Vector(camera_offset)
    camera = HELPERS.add_camera(
        RENDER_PREFIX + "Camera_" + output.stem,
        camera_location,
        target,
        scale,
    )
    scene.camera = camera
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.stamp_note_text = (
        f"REV18 EXACT GLB | {label} | {action_name} f{frame} | "
        "CANDIDATE ONLY | HUMAN REVIEW REQUIRED | NOT G6"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    record = {
        "path": str(output),
        "sha256": HELPERS.sha256(output),
        "bytes": output.stat().st_size,
        "resolution": list(resolution),
        "action": action_name,
        "frame": frame,
        "label": label,
        "camera": {
            "location": HELPERS.vector_values(camera_location),
            "target": HELPERS.vector_values(target),
            "orthographicScale": round(float(scale), 6),
        },
        "poseBounds": {
            "minimum": HELPERS.vector_values(pose_minimum),
            "maximum": HELPERS.vector_values(pose_maximum),
        },
    }
    bpy.data.objects.remove(camera, do_unlink=True)
    return record


def configure(imported: dict[str, Any]) -> dict[str, Any]:
    idle = imported["actions"].get("KYX_REV18_TP_IDLE")
    if idle is None:
        raise RuntimeError("Rev18 import has no KYX_REV18_TP_IDLE")
    HELPERS.assign_action(bpy.context.scene, imported["rig"], idle, 13.0)
    minimum, maximum = HELPERS.evaluated_bounds(imported["meshes"])
    configuration = HELPERS.configure_scene(bpy.context.scene, minimum, maximum)
    # Rev14's evidence rig is intentionally cyan-heavy.  Rev18 uses a neutral
    # inspection balance so dark suit/graphite armor values remain legible and
    # the render does not turn every surface into the same icy-blue material.
    bpy.context.scene.view_settings.exposure = -0.80
    light_settings = {
        "Key": (760.0, (0.88, 0.93, 1.00)),
        "WarmFill": (430.0, (1.00, 0.72, 0.48)),
        "CyanRim": (520.0, (0.22, 0.56, 0.90)),
        "ContactFill": (260.0, (0.70, 0.82, 1.00)),
    }
    for obj in bpy.data.objects:
        if obj.type != "LIGHT":
            continue
        for suffix, (energy, color) in light_settings.items():
            if suffix in obj.name:
                obj.data.energy = energy
                obj.data.color = color
                break
    configuration["exposure"] = bpy.context.scene.view_settings.exposure
    configuration["rev18NeutralInspectionLighting"] = True
    return configuration


def render_eight_view(
    lod0: Path,
    render_dir: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    imported = runtime_import(lod0)
    configuration = configure(imported)
    orbit = (
        ("front", "FRONT", (0.0, 5.2, 1.10)),
        ("front-right", "FRONT RIGHT THREE-QUARTER", (3.8, 3.8, 1.15)),
        ("right", "RIGHT PROFILE", (5.2, 0.0, 1.10)),
        ("rear-right", "REAR RIGHT THREE-QUARTER", (3.8, -3.8, 1.15)),
        ("rear", "REAR", (0.0, -5.2, 1.10)),
        ("rear-left", "REAR LEFT THREE-QUARTER", (-3.8, -3.8, 1.15)),
        ("left", "LEFT PROFILE", (-5.2, 0.0, 1.10)),
        ("front-left", "FRONT LEFT THREE-QUARTER", (-3.8, 3.8, 1.15)),
    )
    views = [
        render_pose(
            imported,
            render_dir / f"kyx-v6c-character-rev18-eight-view-{name}.png",
            action_name="KYX_REV18_TP_IDLE",
            frame=13,
            label=label,
            camera_offset=offset,
            resolution=(1000, 1250),
        )
        for name, label, offset in orbit
    ]
    topology_after = HELPERS.topology_snapshot(imported["meshes"])
    source_after = {
        "sha256": HELPERS.sha256(lod0),
        "bytes": lod0.stat().st_size,
    }
    audit = {
        "source": str(lod0),
        "sha256": imported["hash"],
        "bytes": imported["bytes"],
        "operatorResult": imported["operatorResult"],
        "runtimeMeshes": sorted(obj.name for obj in imported["meshes"]),
        "armature": imported["rig"].name,
        "boneCount": len(imported["rig"].data.bones),
        "actions": sorted(imported["actions"]),
        "topologyBefore": imported["topology"],
        "topologyAfter": topology_after,
        "sourceAfter": source_after,
    }
    return audit, views, configuration


def render_melee_sequence(
    melee_glb: Path,
    render_dir: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    imported = runtime_import(melee_glb)
    configuration = configure(imported)
    sequence = []
    for frame, label in (
        (1, "MELEE WINDUP"),
        (6, "MELEE MAXIMUM WINDUP"),
        (11, "MELEE ACCELERATION"),
        (15, "MELEE STRIKE"),
        (19, "MELEE FOLLOW THROUGH"),
        (24, "MELEE RECOVERY"),
    ):
        sequence.append(
            render_pose(
                imported,
                render_dir / f"kyx-v6c-character-rev18-melee-frame-{frame:02d}.png",
                action_name="KYX_REV18_TP_MELEE",
                frame=frame,
                label=label,
                camera_offset=(-3.7, 4.6, 1.30),
                resolution=(1150, 1250),
                orthographic_scale=2.15,
            )
        )
    sequence.append(
        render_pose(
            imported,
            render_dir / "kyx-v6c-character-rev18-melee-contact-close.png",
            action_name="KYX_REV18_TP_MELEE",
            frame=15,
            label="MELEE HAND / HILT / SOCKET CONTACT",
            camera_offset=(-1.05, 1.35, 0.45),
            resolution=(1400, 1000),
            orthographic_scale=0.62,
            target_mode="contact",
        )
    )
    topology_after = HELPERS.topology_snapshot(imported["meshes"])
    audit = {
        "source": str(melee_glb),
        "sha256": imported["hash"],
        "bytes": imported["bytes"],
        "operatorResult": imported["operatorResult"],
        "runtimeMeshes": sorted(obj.name for obj in imported["meshes"]),
        "armature": imported["rig"].name,
        "boneCount": len(imported["rig"].data.bones),
        "actions": sorted(imported["actions"]),
        "topologyBefore": imported["topology"],
        "topologyAfter": topology_after,
        "sourceAfter": {
            "sha256": HELPERS.sha256(melee_glb),
            "bytes": melee_glb.stat().st_size,
        },
    }
    return audit, sequence, configuration


def main() -> None:
    lod0, melee_glb, evidence_root = script_args()
    if not lod0.is_file() or not melee_glb.is_file():
        raise FileNotFoundError(f"Missing Rev18 GLB: lod0={lod0}, melee={melee_glb}")
    eight_audit, eight_views, eight_configuration = render_eight_view(
        lod0,
        evidence_root / "renders" / "eight-view",
    )
    melee_audit, melee_views, melee_configuration = render_melee_sequence(
        melee_glb,
        evidence_root / "renders" / "melee-contact",
    )
    assertions = {
        "lod0ExactSourceUnchanged": (
            eight_audit["sha256"] == eight_audit["sourceAfter"]["sha256"]
            and eight_audit["bytes"] == eight_audit["sourceAfter"]["bytes"]
        ),
        "meleeExactSourceUnchanged": (
            melee_audit["sha256"] == melee_audit["sourceAfter"]["sha256"]
            and melee_audit["bytes"] == melee_audit["sourceAfter"]["bytes"]
        ),
        "lod0HasThreeRuntimeMeshes": len(eight_audit["runtimeMeshes"]) == 3,
        "meleeHasThreeRuntimeMeshes": len(melee_audit["runtimeMeshes"]) == 3,
        "lod0HasSeventeenActions": len(eight_audit["actions"]) == 17,
        "meleeHasSeventeenActions": len(melee_audit["actions"]) == 17,
        "allEightViewsRendered": (
            len(eight_views) == 8
            and all(Path(view["path"]).is_file() for view in eight_views)
        ),
        "allDynamicContactViewsRendered": (
            len(melee_views) == 7
            and all(Path(view["path"]).is_file() for view in melee_views)
        ),
        "topologyUnchangedDuringRenders": (
            eight_audit["topologyBefore"] == eight_audit["topologyAfter"]
            and melee_audit["topologyBefore"] == melee_audit["topologyAfter"]
        ),
    }
    report = {
        "schema": "kyx-g6-rev18-direct-glb-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": (
            "REV18_DIRECT_GLB_VISUAL_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED_NOT_G6"
            if all(assertions.values())
            else "REV18_DIRECT_GLB_RENDER_ASSERTION_FAILURE"
        ),
        "candidateDisposition": {
            "default": False,
            "releaseEligible": False,
            "g6Accepted": False,
            "humanVisualReviewRequired": True,
        },
        "lod0Import": eight_audit,
        "meleeImport": melee_audit,
        "renderConfiguration": {
            "eightView": eight_configuration,
            "melee": melee_configuration,
        },
        "eightView": eight_views,
        "dynamicMeleeContact": melee_views,
        "assertions": assertions,
        "visualDecision": "PENDING_EXPLICIT_HUMAN_REVIEW_NOT_G6",
        "nonClaims": [
            "Rendered evidence does not grant visual acceptance.",
            "Sampled melee frames do not prove every-frame clipping freedom.",
            "The melee proof GLB is not a runtime equipment promotion.",
            "Runtime camera and gameplay population review remain separate.",
        ],
    }
    report_path = evidence_root / "direct-glb-render-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": report["status"],
                "eightViewCount": len(eight_views),
                "meleeViewCount": len(melee_views),
                "report": str(report_path),
            },
            indent=2,
        )
    )
    if not all(assertions.values()):
        raise RuntimeError(f"Rev18 render assertions failed: {assertions}")


if __name__ == "__main__":
    main()
