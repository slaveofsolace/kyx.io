"""Render bounded direct visual evidence from the exact current Rev14 GLB.

The script always starts from factory settings and fresh-imports the supplied
GLB.  It never saves a Blend file or exports geometry.  Cameras, lights, and a
separate floor plane are render-only helpers; the imported runtime mesh topology
is snapshotted before and after capture and the source GLB hash is pinned across
the run.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


CHECKPOINT = "V6C_LOD0_SEMANTIC_RETOPO_CANDIDATE_REV14"
STATUS = "BOUNDED_DIRECT_GLB_VISUAL_EVIDENCE_REVIEW_REQUIRED_NOT_G6"
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
RENDER_PREFIX = "KYX_REV14_GLB_EVIDENCE_"


def script_args() -> tuple[Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev14.runtime-candidate.glb> <render-dir> <report.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit(
            "Expected -- <rev14.runtime-candidate.glb> <render-dir> <report.json>"
        )
    return tuple(Path(value).resolve() for value in values)  # type: ignore[return-value]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def vector_values(value: Vector) -> list[float]:
    return [round(float(component), 6) for component in value]


def imported_helper_meshes() -> list[bpy.types.Object]:
    return [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.users_collection
        and all(collection.name == "glTF_not_exported" for collection in obj.users_collection)
    ]


def topology_snapshot(meshes: list[bpy.types.Object]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for obj in sorted(meshes, key=lambda item: item.name):
        obj.data.calc_loop_triangles()
        result[obj.name] = {
            "meshData": obj.data.name,
            "vertices": len(obj.data.vertices),
            "edges": len(obj.data.edges),
            "polygons": len(obj.data.polygons),
            "triangles": len(obj.data.loop_triangles),
            "uvLayers": sorted(layer.name for layer in obj.data.uv_layers),
            "colorAttributes": sorted(
                attribute.name for attribute in obj.data.color_attributes
            ),
            "materials": [
                material.name if material is not None else None
                for material in obj.data.materials
            ],
            "modifiers": [
                {"name": modifier.name, "type": modifier.type}
                for modifier in obj.modifiers
            ],
        }
    return result


def evaluated_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points: list[Vector] = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise RuntimeError("Cannot compute bounds for an empty object list")
    return (
        Vector(tuple(min(point[index] for point in points) for index in range(3))),
        Vector(tuple(max(point[index] for point in points) for index in range(3))),
    )


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("Render helper material has no Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def add_area(
    name: str,
    location: Vector,
    target: Vector,
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def choose_render_engine(scene: bpy.types.Scene) -> str:
    failures: list[str] = []
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = candidate
            return scene.render.engine
        except TypeError as error:
            failures.append(f"{candidate}: {error}")
    raise RuntimeError(f"No supported Eevee render engine: {failures}")


def configure_scene(
    scene: bpy.types.Scene,
    character_minimum: Vector,
    character_maximum: Vector,
) -> dict[str, Any]:
    engine = choose_render_engine(scene)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_persistent_data = False
    scene.render.use_stamp = True
    scene.render.use_stamp_note = True
    for property_name in (
        "use_stamp_date",
        "use_stamp_time",
        "use_stamp_render_time",
        "use_stamp_frame",
        "use_stamp_frame_range",
        "use_stamp_memory",
        "use_stamp_hostname",
        "use_stamp_camera",
        "use_stamp_lens",
        "use_stamp_scene",
        "use_stamp_marker",
        "use_stamp_filename",
        "use_stamp_sequencer_strip",
    ):
        if hasattr(scene.render, property_name):
            setattr(scene.render, property_name, False)
    scene.render.stamp_font_size = 18
    scene.render.stamp_foreground = (0.91, 0.97, 1.0, 1.0)
    scene.render.stamp_background = (0.004, 0.011, 0.018, 0.86)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.25
    scene.render.fps = 24

    world = scene.world or bpy.data.worlds.new(RENDER_PREFIX + "World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("World has no Background node")
    background.inputs["Color"].default_value = (0.0035, 0.008, 0.014, 1.0)
    background.inputs["Strength"].default_value = 0.16

    center = (character_minimum + character_maximum) * 0.5
    height = character_maximum.z - character_minimum.z
    scale = max(height / 1.80, 0.65)
    light_target = center + Vector((0.0, -0.10 * scale, 0.10 * height))
    lights = [
        add_area(
            RENDER_PREFIX + "Key",
            light_target + Vector((-2.8, -3.7, 2.35)) * scale,
            light_target,
            1180.0,
            2.25 * scale,
            (0.72, 0.88, 1.0),
        ),
        add_area(
            RENDER_PREFIX + "WarmFill",
            light_target + Vector((3.0, -2.6, 1.25)) * scale,
            light_target,
            860.0,
            2.10 * scale,
            (1.0, 0.55, 0.27),
        ),
        add_area(
            RENDER_PREFIX + "CyanRim",
            light_target + Vector((0.6, 3.0, 2.25)) * scale,
            light_target,
            1400.0,
            1.75 * scale,
            (0.08, 0.66, 1.0),
        ),
        add_area(
            RENDER_PREFIX + "ContactFill",
            light_target + Vector((-0.2, -2.0, 0.50)) * scale,
            light_target + Vector((0.0, -0.25, 0.15)) * scale,
            580.0,
            0.95 * scale,
            (0.56, 0.84, 1.0),
        ),
    ]

    floor_z = character_minimum.z - 0.012 * scale
    floor_material = render_material(
        RENDER_PREFIX + "FloorMaterial",
        (0.008, 0.018, 0.029, 1.0),
        roughness=0.84,
        metallic=0.08,
    )
    bpy.ops.mesh.primitive_plane_add(
        size=8.0 * scale,
        location=(center.x, center.y, floor_z),
    )
    floor = bpy.context.object
    floor.name = RENDER_PREFIX + "Floor"
    floor.data.materials.append(floor_material)

    return {
        "engine": engine,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "worldColor": [0.0035, 0.008, 0.014, 1.0],
        "worldStrength": 0.16,
        "renderHelpers": {
            "cameraCountCreatedPerView": 1,
            "lights": [light.name for light in lights],
            "floor": floor.name,
            "floorZ": round(float(floor_z), 6),
        },
    }


def assign_action(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    action: bpy.types.Action,
    frame: float,
) -> None:
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    animation_data.action = action
    scene.frame_start = int(action.frame_range[0])
    scene.frame_end = int(action.frame_range[1])
    scene.frame_set(int(frame))
    bpy.context.view_layer.update()


def pose_bone_world(rig: bpy.types.Object, name: str) -> Vector | None:
    bone = rig.pose.bones.get(name)
    if bone is None:
        return None
    return rig.matrix_world @ bone.head


def contact_target(rig: bpy.types.Object, rifle: bpy.types.Object) -> tuple[Vector, dict[str, Any]]:
    points = [
        value
        for value in (
            pose_bone_world(rig, "palm.R"),
            pose_bone_world(rig, "palm.L"),
            pose_bone_world(rig, "wrist.R"),
            pose_bone_world(rig, "wrist.L"),
        )
        if value is not None
    ]
    rifle_minimum, rifle_maximum = evaluated_bounds([rifle])
    rifle_center = (rifle_minimum + rifle_maximum) * 0.5
    if points:
        hands_center = sum(points, Vector()) / len(points)
        target = hands_center * 0.72 + rifle_center * 0.28
    else:
        hands_center = rifle_center
        target = rifle_center
    return target, {
        "handBoneNamesAvailable": sorted(
            name
            for name in ("palm.R", "palm.L", "wrist.R", "wrist.L")
            if rig.pose.bones.get(name) is not None
        ),
        "handsCenter": vector_values(hands_center),
        "rifleBounds": {
            "minimum": vector_values(rifle_minimum),
            "maximum": vector_values(rifle_maximum),
        },
        "target": vector_values(target),
    }


def add_camera(
    name: str,
    location: Vector,
    target: Vector,
    orthographic_scale: float,
) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = orthographic_scale
    data.lens = 55.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


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
    assign_action(scene, rig, action, float(spec["frame"]))
    pose_minimum, pose_maximum = evaluated_bounds(runtime_meshes)
    pose_center = (pose_minimum + pose_maximum) * 0.5
    pose_height = pose_maximum.z - pose_minimum.z
    target_details: dict[str, Any]
    if spec["targetMode"] == "contact":
        target, target_details = contact_target(rig, rifle)
        orthographic_scale = float(spec["orthographicScale"])
    else:
        target = pose_center + Vector((0.0, -0.025, pose_height * 0.015))
        target_details = {"target": vector_values(target)}
        orthographic_scale = max(
            pose_height * float(spec["heightMultiplier"]),
            float(spec["minimumScale"]),
        )

    camera_location = target + Vector(spec["cameraOffset"])
    camera = add_camera(
        RENDER_PREFIX + "Camera_" + spec["name"],
        camera_location,
        target,
        orthographic_scale,
    )
    scene.camera = camera
    scene.render.resolution_x = int(spec["resolution"][0])
    scene.render.resolution_y = int(spec["resolution"][1])
    scene.render.stamp_note_text = (
        f"REV14 EXACT GLB | {spec['label']} | {action.name} f{int(spec['frame'])} "
        "| BOUNDED VISUAL EVIDENCE | REVIEW REQUIRED | NOT G6"
    )
    output = render_dir / f"kyx-v6c-lod0-retopo-rev14-{spec['name']}.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    first_hash = sha256(output)
    first_bytes = output.stat().st_size

    repeat = output.with_name(output.stem + ".determinism-repeat.png")
    scene.render.filepath = str(repeat)
    bpy.ops.render.render(write_still=True)
    repeat_hash = sha256(repeat)
    repeat_bytes = repeat.stat().st_size
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
        "actionFrameRange": [
            float(action.frame_range[0]),
            float(action.frame_range[1]),
        ],
        "sampledFrame": int(spec["frame"]),
        "camera": {
            "type": "ORTHOGRAPHIC",
            "location": vector_values(camera_location),
            "target": vector_values(target),
            "orthographicScale": round(orthographic_scale, 6),
        },
        "poseBounds": {
            "minimum": vector_values(pose_minimum),
            "maximum": vector_values(pose_maximum),
        },
        "targetDetails": target_details,
        "determinismRepeat": {
            "bytes": repeat_bytes,
            "sha256": repeat_hash,
            "matchesFirstRender": repeat_hash == first_hash
            and repeat_bytes == first_bytes,
            "repeatFileRemoved": not repeat.exists(),
        },
    }


def main() -> None:
    glb_path, render_dir, report_path = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
    render_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    source_hash_before = sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Fresh GLB import failed: {import_result}")

    helpers = imported_helper_meshes()
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
    if rig is None:
        raise RuntimeError("Fresh Rev14 import contains no armature")
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            "Rev14 clip contract mismatch: "
            f"{sorted(actions)} != {sorted(EXPECTED_CLIPS)}"
        )
    if len(runtime_meshes) != 3:
        raise RuntimeError(
            f"Expected three runtime meshes after helper exclusion, got {len(runtime_meshes)}"
        )
    if len(rig.data.bones) != 52:
        raise RuntimeError(f"Expected 52-bone rig, got {len(rig.data.bones)}")
    rifle = next(
        (obj for obj in runtime_meshes if "RIFLE_REV14" in obj.name.upper()),
        None,
    )
    if rifle is None:
        raise RuntimeError("Fresh Rev14 import contains no rifle role mesh")

    topology_before = topology_snapshot(runtime_meshes)
    idle = actions["KYX_V6C_TP_IDLE"]
    assign_action(bpy.context.scene, rig, idle, 13.0)
    character_minimum, character_maximum = evaluated_bounds(runtime_meshes)
    render_configuration = configure_scene(
        bpy.context.scene,
        character_minimum,
        character_maximum,
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
            "name": "weapon-contact-firing-side",
            "label": "WEAPON CONTACT CLOSE / FIRING SIDE",
            "action": "KYX_V6C_TP_PRIMARY_FIRE",
            "frame": 6,
            "targetMode": "contact",
            "cameraOffset": (2.15, -3.45, 0.82),
            "orthographicScale": 0.86,
            "resolution": (1600, 1100),
        },
        {
            "name": "weapon-contact-support-side",
            "label": "WEAPON CONTACT CLOSE / SUPPORT SIDE",
            "action": "KYX_V6C_TP_IDLE",
            "frame": 13,
            "targetMode": "contact",
            "cameraOffset": (-2.15, -3.45, 0.82),
            "orthographicScale": 0.86,
            "resolution": (1600, 1100),
        },
        {
            "name": "action-run-stride",
            "label": "RUN CLIP SAMPLE / MOTION UNPROVEN",
            "action": "KYX_V6C_TP_RUN",
            "frame": 7,
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

    topology_after = topology_snapshot(runtime_meshes)
    source_hash_after = sha256(glb_path)
    source_bytes_after = glb_path.stat().st_size
    assertions = {
        "sourceGlbHashAndBytesUnchanged": source_hash_before == source_hash_after
        and source_bytes_before == source_bytes_after,
        "freshImportFinished": "FINISHED" in import_result,
        "threeRuntimeMeshesAfterImporterHelperExclusion": len(runtime_meshes) == 3,
        "single52BoneRuntimeRig": len(rigs) == 1 and len(rig.data.bones) == 52,
        "exactTenClipContractPresent": set(actions) == set(EXPECTED_CLIPS),
        "allFiveRequiredViewsRendered": len(views) == 5
        and all(Path(view["path"]).is_file() for view in views),
        "everyViewRepeatHashMatches": all(
            view["determinismRepeat"]["matchesFirstRender"] for view in views
        ),
        "importedRuntimeTopologyUnchangedAcrossCapture": topology_before
        == topology_after,
        "noBlendSavedAndNoGeometryExported": True,
    }
    if not all(assertions.values()):
        raise RuntimeError(f"Rev14 visual evidence assertion failed: {assertions}")

    report = {
        "schema": "kyx-v6c-lod0-retopo-rev14-direct-glb-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": STATUS,
        "checkpoint": CHECKPOINT,
        "blenderVersion": bpy.app.version_string,
        "scope": (
            "Fresh-imported direct visual evidence for the exact current Rev14 "
            "runtime-candidate GLB. Cameras, lights, and a separate floor are "
            "render-only helpers; imported runtime geometry is unchanged."
        ),
        "sourceGlb": {
            "path": str(glb_path),
            "bytesBefore": source_bytes_before,
            "bytesAfter": source_bytes_after,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "unchanged": source_hash_before == source_hash_after
            and source_bytes_before == source_bytes_after,
        },
        "freshImport": {
            "operatorResult": sorted(import_result),
            "runtimeMeshes": sorted(obj.name for obj in runtime_meshes),
            "excludedImporterHelperMeshes": sorted(obj.name for obj in helpers),
            "armature": rig.name,
            "boneCount": len(rig.data.bones),
            "actions": [
                {
                    "name": action.name,
                    "frameRange": [
                        float(action.frame_range[0]),
                        float(action.frame_range[1]),
                    ],
                }
                for action in sorted(actions.values(), key=lambda item: item.name)
            ],
            "topologyBefore": topology_before,
            "topologyAfter": topology_after,
        },
        "renderConfiguration": render_configuration,
        "views": views,
        "assertions": assertions,
        "visualDecision": "FAIL_OPEN_VISUAL_BLOCKERS_NOT_HUMAN_ACCEPTED_NOT_G6",
        "agentVisualInspection": {
            "status": "FAIL_BOUNDED_VISUAL_REVIEW_NOT_G6",
            "correctedDefect": (
                "The earlier giant lower-body pyramid was an importer-only "
                "Icosphere helper accidentally consolidated into the hard role. "
                "The rebuilt GLB excludes it before allocation and role joining; "
                "the five current renders show the full body without that artifact."
            ),
            "openBlockers": [
                "The firing hand is open and offset rather than convincingly gripping the trigger and handle.",
                "The support hand has loose open fingers, sits below the foregrip, and may clip the underside.",
                "Torso-to-hip material transitions remain patchy.",
                "Pants and boots lack final production surface detail.",
                "The sampled run frame reads nearly static; convincing run-stride readability is not visually proven.",
            ],
        },
        "boundedObservations": [
            "The exact current GLB fresh-imports and renders as three skinned runtime role meshes with its embedded 52-bone rig.",
            "Front/rear silhouette, two weapon-contact angles, and one sampled run pose are directly visible in the generated PNGs.",
            "The run and primary-fire images use the embedded GLB actions rather than an authored render-only pose.",
            "Repeat renders are byte-identical for every captured view in this run.",
            "The repaired packet removes the accidental importer-helper pyramid and exposes the remaining contact, material, and animation-readability blockers.",
        ],
        "nonClaims": [
            "This packet does not grant human visual acceptance or close G6.",
            "This packet does not claim final textures, texture atlases, LOD1, LOD2, first-person arms, markers, product integration, performance, or release eligibility.",
            "Visible proximity in contact renders is not a substitute for the separate numeric contact audit.",
            "The floor, cameras, and lights are render-only helpers and are not part of the source GLB.",
            "The source GLB, its imported mesh topology, physics, UI, deployment configuration, and runtime product assets are not modified by this renderer.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
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
                    "importedRuntimeTopologyUnchangedAcrossCapture"
                ],
                "report": str(report_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
