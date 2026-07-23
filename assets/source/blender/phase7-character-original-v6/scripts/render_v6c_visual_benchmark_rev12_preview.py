"""Fast, non-acceptance silhouette previews for V6-C benchmark revision 12."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R12_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV12"
RIFLE_COLLECTION = PREFIX + "ProductionHardSurfaceRifle"

UTILITY_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev12_preview_utilities", UTILITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load render utilities: {UTILITY_PATH}")
u = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u)
for module in (
    u, u.r10, u.r10.r8, u.r10.r8.r7, u.r10.r8.r7.r6,
    u.r10.r8.r7.r6.r5, u.r10.r8.r7.r6.r5.r4,
    u.r10.r8.r7.r6.r5.r4.r3, u.r10.r8.r7.r6.r5.r4.r3.r2,
    u.r10.r8.r7.r6.r5.r4.r3.r2.r1, u.r10.base,
):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
    module.RIFLE_COLLECTION = RIFLE_COLLECTION
base = u.r10.base


def deform_object_world(obj: bpy.types.Object, transform) -> None:
    inverse = obj.matrix_world.inverted()
    if obj.type == "MESH":
        for vertex in obj.data.vertices:
            vertex.co = inverse @ transform(obj.matrix_world @ vertex.co)
        obj.data.update()
    elif obj.type == "CURVE":
        for spline in obj.data.splines:
            for point in spline.bezier_points:
                point.co = inverse @ transform(obj.matrix_world @ point.co)
                point.handle_left = inverse @ transform(obj.matrix_world @ point.handle_left)
                point.handle_right = inverse @ transform(obj.matrix_world @ point.handle_right)


def stage_literal_contact_pose(character: list[bpy.types.Object]) -> None:
    arm_tokens = ("Arm", "Shoulder", "Bicep", "Elbow", "Forearm", "Glove")
    targets = {
        -1: {
            "label": "L_", "shoulder": Vector((-0.390, -0.004, 1.565)),
            "elbow": Vector((-0.490, -0.105, 1.390)), "hand": Vector((-0.250573, -0.141000, 1.313522)),
        },
        1: {
            "label": "R_", "shoulder": Vector((0.390, -0.004, 1.565)),
            "elbow": Vector((0.445, -0.110, 1.390)), "hand": Vector((0.168362, -0.134876, 1.278882)),
        },
    }
    for side, data in targets.items():
        old_shoulder = Vector((side * 0.390, -0.004, 1.565))
        old_hand = Vector((side * 0.465, -0.055, 0.705))
        old_elbow = old_shoulder.lerp(old_hand, 0.52)
        upper_rotation = (old_elbow - old_shoulder).rotation_difference(data["elbow"] - data["shoulder"])
        lower_rotation = (old_hand - old_elbow).rotation_difference(data["hand"] - data["elbow"])

        def pose(point: Vector, old_shoulder=old_shoulder, old_hand=old_hand, old_elbow=old_elbow, data=data, upper_rotation=upper_rotation, lower_rotation=lower_rotation) -> Vector:
            denominator = old_shoulder.z - old_hand.z
            t = max(0.0, min(1.0, (old_shoulder.z - point.z) / denominator))
            if t <= 0.52:
                old_center = old_shoulder.lerp(old_elbow, t / 0.52)
                new_center = data["shoulder"].lerp(data["elbow"], t / 0.52)
                local = upper_rotation @ (point - old_center)
            else:
                old_center = old_elbow.lerp(old_hand, (t - 0.52) / 0.48)
                new_center = data["elbow"].lerp(data["hand"], (t - 0.52) / 0.48)
                local = lower_rotation @ (point - old_center)
            return new_center + local

        for obj in character:
            if data["label"] in obj.name and any(token in obj.name for token in arm_tokens) and "Shoulder" not in obj.name:
                deform_object_world(obj, pose)


def closest_evaluated_distance(objects: list[bpy.types.Object], target: Vector) -> float:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    best = float("inf")
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        matrix = evaluated.matrix_world
        for vertex in mesh.vertices:
            best = min(best, (matrix @ vertex.co - target).length)
        evaluated.to_mesh_clear()
    return best


def main() -> None:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev12.blend> <preview-dir>")
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 2:
        raise SystemExit("Expected -- <rev12.blend> <preview-dir>")
    blend_path, output_dir = (Path(value).resolve() for value in args)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    rifle_collection = bpy.data.collections.get(RIFLE_COLLECTION)
    rifle = list(rifle_collection.all_objects) if rifle_collection else []
    rifle_ids = {id(obj) for obj in rifle}
    character = [obj for obj in bpy.data.objects if obj.name.startswith(PREFIX) and obj.type in {"MESH", "CURVE"} and id(obj) not in rifle_ids]
    if not character:
        raise RuntimeError("No rev12 character geometry")
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.58
    scale = max((maximum.z - minimum.z) * 1.10, (maximum.x - minimum.x) / (1050 / 1320) * 1.05)
    target = Vector((0.0, -0.005, (minimum.z + maximum.z) * 0.5))
    records = []
    for label, offset in (
        ("front", Vector((0.0, -4.50, 0.02))),
        ("three-quarter", Vector((3.05, -3.60, 0.18))),
        ("rear-three-quarter", Vector((-3.05, 3.60, 0.18))),
    ):
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev12-preview-{label}.png",
            camera, target, target + offset, scale, (1050, 1320),
            f"REV12 STRATEGY RESET PREVIEW | {label.upper()} | ATHLETIC LOFT + FITTED SHELLS | NOT ACCEPTANCE EVIDENCE",
        ))
    base.restore_visibility(character + rifle, snapshots)
    rifle_snapshots = base.visibility_snapshot(character + rifle)
    for obj in character:
        obj.hide_render = True
    for obj in rifle:
        obj.hide_render = False
    rifle_minimum, rifle_maximum = base.combined_bounds(rifle)
    rifle_target = (rifle_minimum + rifle_maximum) * 0.5
    rifle_scale = max(
        (rifle_maximum.z - rifle_minimum.z) * 1.65,
        (rifle_maximum.x - rifle_minimum.x) / (1500 / 720) * 1.12,
    ) * 1.34
    records.append(base.write_render(
        output_dir / "kyx-v6c-benchmark-rev12-preview-rifle.png",
        camera, rifle_target, rifle_target + Vector((0.0, -3.2, 0.06)), rifle_scale, (1500, 720),
        "REV12 RIFLE PREVIEW | ASSEMBLED RECEIVER / STOCK / HANDGUARD / GRIP / MAGAZINE / BARREL | OFF-GROUND",
    ))
    base.restore_visibility(character + rifle, rifle_snapshots)
    for obj in character + rifle:
        obj.hide_render = False
    stage_literal_contact_pose(character)
    primary_target = Vector((-0.250573, -0.141000, 1.313522))
    support_target = Vector((0.168362, -0.134876, 1.278882))
    shoulder_target = Vector((-0.493559, -0.079878, 1.403323))
    primary_hand_distance = closest_evaluated_distance([obj for obj in character if "L_Glove" in obj.name], primary_target)
    support_hand_distance = closest_evaluated_distance([obj for obj in character if "R_Glove" in obj.name], support_target)
    shoulder_body_distance = closest_evaluated_distance([obj for obj in character if "L_Shoulder" in obj.name or "Chest_L" in obj.name], shoulder_target)
    primary_weapon_distance = closest_evaluated_distance([obj for obj in rifle if "PistolGrip" in obj.name or "TriggerGuard" in obj.name], primary_target)
    support_weapon_distance = closest_evaluated_distance([obj for obj in rifle if "Foregrip" in obj.name or "Handguard" in obj.name], support_target)
    shoulder_weapon_distance = closest_evaluated_distance([obj for obj in rifle if "Stock" in obj.name or "BufferBridge" in obj.name], shoulder_target)
    primary_distance = max(primary_hand_distance, primary_weapon_distance)
    support_distance = max(support_hand_distance, support_weapon_distance)
    shoulder_distance = max(shoulder_body_distance, shoulder_weapon_distance)
    contact_target = Vector((0.0, -0.150, 1.330))
    contact_title = (
        f"STATIC CONTACT PROOF | PRIMARY {primary_distance*1000:.1f} MM | SUPPORT {support_distance*1000:.1f} MM | "
        f"SHOULDER {shoulder_distance*1000:.1f} MM | NO RIG / NO ANIMATION CLAIM"
    )
    records.append(base.write_render(
        output_dir / "kyx-v6c-benchmark-rev12-preview-held-contact.png",
        camera, contact_target, contact_target + Vector((-2.65, -3.75, 0.32)), 1.90, (1200, 1400), contact_title,
    ))
    records.append(base.write_render(
        output_dir / "kyx-v6c-benchmark-rev12-preview-held-contact-close.png",
        camera, contact_target + Vector((0.0, -0.025, 0.020)),
        contact_target + Vector((-2.25, -3.35, 0.30)), 1.20, (1400, 1000), contact_title,
    ))
    print({"contactDistancesMeters": {
        "primaryWitnessWorstSide": primary_distance, "primaryHand": primary_hand_distance, "primaryWeapon": primary_weapon_distance,
        "supportWitnessWorstSide": support_distance, "supportHand": support_hand_distance, "supportWeapon": support_weapon_distance,
        "shoulderWitnessWorstSide": shoulder_distance, "shoulderBody": shoulder_body_distance, "shoulderWeapon": shoulder_weapon_distance,
    }})
    print({"status": "REV12_FIRST_SILHOUETTE_PREVIEW_COMPLETE", "files": [record["fileName"] for record in records]})


if __name__ == "__main__":
    main()
