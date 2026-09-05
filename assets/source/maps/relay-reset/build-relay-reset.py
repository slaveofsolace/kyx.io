"""Author Relay review meshes from its frozen collision contract.

No imported asset payloads, add-ons, image textures, drivers, or handlers.
Run with Blender --background --factory-startup --disable-autoexec --python.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[3]
OUTPUT = ROOT / "assets/review/runtime-candidates/relay-reset-map"
LAYOUT = json.loads((SOURCE / "layout.json").read_text(encoding="utf-8"))
AXIS_SWAP = Matrix(((1, 0, 0), (0, 0, 1), (0, 1, 0)))
TREATMENTS = ("communications-deck", "ceramic-campus", "transmitter-workshop")
CURRENT = None
MATERIALS = {}


def vector(x, y, z):
    """Authority X/Y-up/Z-north -> editable Blender X/Y-north/Z-up."""
    return (x, z, y)


def linear_channel(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, hex_color, roughness, metalness=0.0, emission=0.0):
    rgb = [((hex_color >> shift) & 255) / 255 for shift in (16, 8, 0)]
    rgba = tuple(linear_channel(channel) for channel in rgb) + (1.0,)
    result = bpy.data.materials.new("RELAY_RESET_" + name.upper())
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metalness
    if emission:
        shader.inputs["Emission Color"].default_value = rgba
        shader.inputs["Emission Strength"].default_value = emission
    result.diffuse_color = rgba
    return result


def mesh_object(name, vertices, faces, role, parent=None):
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata([vector(*point) for point in vertices], [], faces)
    mesh.update()
    # Swapping authoring Y and Z reflects winding.
    for polygon in mesh.polygons:
        polygon.flip()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[role])
    obj["noHit"] = True
    obj["renderMeshesMayBeAuthority"] = False
    obj["materialRole"] = role
    obj["reviewTreatment"] = CURRENT
    if parent:
        obj.parent = parent
        obj["authorityAnchorId"] = parent.get("authorityAnchorId", "beyond_boundary")
    return obj


def cuboid(name, center, size, role, parent=None, bevel=0.0):
    x, y, z = [value / 2 for value in size]
    vertices = [
        (-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
        (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    obj = mesh_object(name, vertices, faces, role, parent)
    obj.location = vector(*center)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge radius", "BEVEL")
        modifier.width = min(bevel, min(size) / 4)
        modifier.segments = 2
    return obj


def face_panel(name, center, width, height, thickness, role, parent=None, cut=0.07):
    """A clipped plate with deliberately unequal shoulder and lower corner sizes."""
    cut = min(cut, width * 0.12, height * 0.2)
    half_w, half_h = width / 2, height / 2
    outline = [
        (-half_w + cut, -half_h), (half_w - cut, -half_h),
        (half_w, -half_h + cut), (half_w, half_h - cut * 1.8),
        (half_w - cut * 1.8, half_h), (-half_w + cut * 1.8, half_h),
        (-half_w, half_h - cut * 1.8), (-half_w, -half_h + cut),
    ]
    count = len(outline)
    vertices = [(x, y, z) for z in (-thickness / 2, thickness / 2) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    obj = mesh_object(name, vertices, faces, role, parent)
    obj.location = vector(*center)
    return obj


def rod(name, start, end, radius, role, parent=None, segments=8):
    a, b = Vector(vector(*start)), Vector(vector(*end))
    length = (b - a).length
    vertices = []
    for y in (-length / 2, length / 2):
        for i in range(segments):
            angle = i * math.tau / segments
            vertices.append((math.cos(angle) * radius, y, math.sin(angle) * radius))
    faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    faces.extend((i, (i + 1) % segments, (i + 1) % segments + segments, i + segments) for i in range(segments))
    obj = mesh_object(name, vertices, faces, role, parent)
    obj.location = (a + b) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (b - a).to_track_quat("Z", "Y")
    return obj


def fixture_root(solid):
    obj = bpy.data.objects.new(solid["id"], None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_size = 0.3
    obj["authorityAnchorId"] = solid["id"]
    obj["noHit"] = True
    angles = solid["rotationMilliDegrees"]
    x, y, z = [angles[axis] * math.pi / 180000 / 2 for axis in "xyz"]
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    q = Quaternion((cx * cy * cz + sx * sy * sz,
                    sx * cy * cz - cx * sy * sz,
                    cx * sy * cz + sx * cy * sz,
                    cx * cy * sz - sx * sy * cz))
    rotation = AXIS_SWAP @ q.to_matrix() @ AXIS_SWAP
    center = solid["centerMm"]
    obj.matrix_world = Matrix.Translation(Vector(vector(*(center[axis] / 1000 for axis in "xyz")))) @ rotation.to_4x4()
    return obj


def cover(solid, parent, size):
    x, y, z = size
    name = solid["id"].replace("relay_module_", "")
    # A load frame preserves the exact collision envelope. Recesses are <=20mm.
    cuboid(name + "_core", (0, 0, 0), (x - 0.025, y - 0.025, z - 0.025), "shell", parent, 0.012)
    for side in (-1, 1):
        for end in (-1, 1):
            cuboid(name + f"_corner_{side}_{end}", (side * (x / 2 - 0.065), 0, end * (z / 2 - 0.065)), (0.13, y, 0.13), "structure", parent, 0.014)
    for end in (-1, 1):
        face_z = end * (z / 2 - 0.006)
        if CURRENT == "communications-deck":
            face_panel(name + f"_service_plate_{end}", (0, 0, face_z), x - 0.3, y - 0.2, 0.012, "shell", parent, 0.1)
            for side in (-1, 1):
                cuboid(name + f"_rib_{end}_{side}", (side * x * 0.28, 0, face_z + end * 0.005), (0.065, y - 0.16, 0.008), "structure", parent)
            face_panel(name + f"_service_inset_{end}", (0, -y * 0.12, face_z + end * 0.009), x * 0.29, y * 0.28, 0.003, "secondary", parent, 0.05)
        elif CURRENT == "ceramic-campus":
            face_panel(name + f"_ceramic_shell_{end}", (0, 0, face_z), x - 0.16, y - 0.13, 0.012, "shell", parent, min(0.14, y * 0.12))
            face_panel(name + f"_recessed_access_{end}", (-x * 0.18, -y * 0.03, face_z + end * 0.008), x * 0.32, y * 0.59, 0.003, "secondary", parent, 0.06)
            cuboid(name + f"_gasket_{end}", (x * 0.27, 0, face_z + end * 0.006), (0.018, y * 0.77, 0.002), "gasket", parent)
        else:
            face_panel(name + f"_folded_door_{end}", (0, 0, face_z), x - 0.18, y - 0.16, 0.012, "shell", parent, 0.04)
            cuboid(name + f"_door_split_{end}", (0, -y * 0.04, face_z + end * 0.008), (0.025, y * 0.73, 0.004), "gasket", parent)
            for row in (-1, 0, 1):
                cuboid(name + f"_folded_shutter_{end}_{row}", (x * 0.24, row * 0.09 + y * 0.2, face_z + end * 0.009), (x * 0.21, 0.032, 0.004), "structure", parent)
        cuboid(name + f"_service_latch_{end}", (x * 0.26, -y * 0.15, face_z + end * 0.008), (0.13, 0.07, 0.004), "ochre", parent, 0.007)
    cuboid(name + "_top_load_cap", (0, y / 2 - 0.04, 0), (x - 0.12, 0.08, z), "structure", parent, 0.012)


def walk_surface(solid, parent, size):
    x, y, z = size
    name = solid["id"]
    upper = solid["centerMm"]["y"] > 1500
    cuboid(name + "_slab", (0, 0, 0), size, "floor" if not upper else "secondary", parent)
    # Sparse manufactured joints communicate scale without wallpaper stripes.
    if y < 0.8:
        for side in (-1, 1):
            cuboid(name + f"_edge_{side}", (0, y / 2 + 0.002, side * (z / 2 - 0.06)), (max(0.05, x - 0.05), 0.004, 0.035), "gasket", parent)
        joints = max(0, int(x / 4) - 1)
        for i in range(joints):
            px = -x / 2 + (i + 1) * x / (joints + 1)
            cuboid(name + f"_expansion_joint_{i}", (px, y / 2 + 0.0015, 0), (0.023, 0.003, max(0.05, z - 0.18)), "gasket", parent)
    if "ramp" in name:
        for side in (-1, 1):
            cuboid(name + f"_ramp_safety_{side}", (0, y / 2 + 0.003, side * (z / 2 - 0.16)), (x - 0.32, 0.005, 0.055), "ochre", parent)
    if upper:
        for side in (-1, 1):
            cuboid(name + f"_structural_fascia_{side}", (0, -y * 0.16, side * (z / 2 - 0.027)), (x, y * 0.59, 0.05), "structure", parent)


def wall(solid, parent, size):
    x, y, z = size
    name = solid["id"]
    cuboid(name + "_structure", (0, 0, 0), size, "structure", parent)
    along_x = x >= z
    span = x if along_x else z
    thickness = z if along_x else x
    panels = max(1, math.ceil(span / 4.5))
    for index in range(panels):
        offset = -span / 2 + (index + 0.5) * span / panels
        for side in (-1, 1):
            c = (offset, 0, side * (thickness / 2 + 0.001))
            obj = face_panel(name + f"_panel_{index}_{side}", c, span / panels - 0.07, y - 0.12, 0.004, "shell", parent, 0.06 if CURRENT == "ceramic-campus" else 0.025)
            if not along_x:
                obj.location = vector(side * (thickness / 2 + 0.001), 0, offset)
                obj.rotation_euler.z = math.pi / 2
    if "spawn" in name:
        # One ochre service latch, no permanent team-colored combat distraction.
        for side in (-1, 1):
            cuboid(name + f"_exit_latch_{side}", (x * 0.32, -y * 0.1, side * (z / 2 + 0.003)), (0.18, 0.1, 0.004), "ochre", parent)


def guard(solid, parent, size):
    x, y, z = size
    name = solid["id"]
    cuboid(name + "_solid_guard", (0, 0, 0), size, "secondary", parent)
    # The authority guard is solid; do not dress it as a see-through handrail.
    if x > z:
        cuboid(name + "_cap", (0, y / 2 - 0.045, 0), (x, 0.09, z), "structure", parent)
        width = min(x, 3.5)
        cuboid(name + "_safety_band", (0, y / 2 - 0.13, -z / 2 - 0.002), (width - 0.15, 0.036, 0.004), "ochre", parent)
    else:
        cuboid(name + "_cap", (0, y / 2 - 0.045, 0), (x, 0.09, z), "structure", parent)


def transmitter():
    root = bpy.data.objects.new("RELAY_RESET_NORTH_TRANSMITTER", None)
    bpy.context.scene.collection.objects.link(root)
    root["authorityAnchorId"] = "beyond_relay_boundary_north"
    root["clearanceBasis"] = "All vertices remain beyond authority north boundary outer edge z=24.5m"
    root.location = vector(0, 0, 27.3)
    cuboid("transmitter_service_foundation", (0, 1.6, 0), (14, 4.2, 4.4), "structure", root)
    for side in (-1, 1):
        cuboid(f"transmitter_ceramic_shoulder_{side}", (side * 5.8, 3.35, 0), (1.45, 7.7, 3.2), "shell", root, 0.14)
    if CURRENT == "communications-deck":
        cuboid("open_deck_equipment_beam", (0, 6.8, 0), (12.3, 0.58, 1.0), "structure", root, 0.05)
        for side in (-1, 1):
            rod(f"open_deck_diagonal_brace_{side}", (side * 5.8, 3.6, -0.1), (side * 2.0, 6.55, -0.1), 0.18, "structure", root)
            face_panel(f"open_deck_antenna_plate_{side}", (side * 2.6, 8.25, -0.25), 4.1, 3.9, 0.25, "shell", root, 0.45)
            for index in range(3):
                cuboid(f"open_deck_antenna_fins_{side}_{index}", (side * 2.6, 7.2 + index * 0.72, -0.41), (3.5, 0.075, 0.08), "structure", root)
        cuboid("open_deck_receiver_slot", (0, 8.3, -0.2), (0.35, 3.2, 0.4), "active", root)
    elif CURRENT == "ceramic-campus":
        # Two unequal-height pressure shells frame a short, recessed transmitter.
        for side, height in ((-1, 6.5), (1, 4.75)):
            face_panel(f"campus_signal_baffle_{side}", (side * 2.8, 7.0, -0.15), 4.35, height, 1.0, "shell", root, 0.65)
            face_panel(f"campus_dark_inset_{side}", (side * 2.8, 6.75, -0.665), 3.3, height * 0.62, 0.035, "secondary", root, 0.36)
        cuboid("campus_receiver_saddle", (0, 6.3, -0.05), (2.1, 0.65, 1.6), "structure", root, 0.08)
        face_panel("campus_receiver_aperture", (0, 7.0, -0.8), 1.3, 1.15, 0.14, "active", root, 0.2)
        cuboid("campus_calibration_tab", (-4.0, 4.4, -0.8), (0.75, 0.25, 0.1), "ochre", root)
    else:
        for side in (-1, 1):
            shoulder = face_panel(f"workshop_roof_shoulder_{side}", (side * 3.2, 6.2, 0), 5.5, 3.7, 2.1, "shell", root, 0.12)
            shoulder.rotation_euler.y = side * math.radians(14)
            for index in range(3):
                cuboid(f"workshop_shutter_{side}_{index}", (side * 3.2, 5.25 + index * 0.56, -1.1), (4.4, 0.17, 0.12), "structure", root, 0.025)
        face_panel("workshop_signal_horn", (0, 8.8, 0), 4.8, 1.8, 1.7, "structure", root, 0.15)
        face_panel("workshop_signal_horn_face", (0, 8.8, -0.88), 3.9, 1.12, 0.06, "secondary", root, 0.1)
        cuboid("workshop_live_slot", (0, 8.8, -0.94), (2.6, 0.12, 0.03), "active", root)


def export_treatment(treatment):
    global CURRENT, MATERIALS
    CURRENT = treatment
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    MATERIALS = {
        "shell": material("warm_ceramic", 0xC9C6B7, 0.66, 0.06),
        "secondary": material("gray_ceramic", 0x929E9C, 0.72, 0.08),
        "structure": material("dark_load_frame", 0x293337, 0.46, 0.58),
        "floor": material("service_floor", 0x73817F, 0.84, 0.06),
        "gasket": material("sealed_joint", 0x25302F, 0.92),
        "ochre": material("service_ochre", 0xB58739, 0.6, 0.05),
        "active": material("active_aperture", 0x71BDC0, 0.42, 0.12, 0.18),
    }
    for solid in LAYOUT["fixture"]["solids"]:
        parent = fixture_root(solid)
        half = solid["shape"]["halfExtentsMm"]
        size = tuple(half[axis] * 2 / 1000 for axis in "xyz")
        name = solid["id"]
        if "module_" in name:
            cover(solid, parent, size)
        elif "guard_rail" in name:
            guard(solid, parent, size)
        elif "boundary" in name or "wall_" in name:
            wall(solid, parent, size)
        elif "support" in name:
            cuboid(name + "_pier", (0, 0, 0), size, "structure", parent, 0.022)
            cuboid(name + "_service_face", (0, 0, -size[2] / 2 - 0.001), (size[0] * 0.62, size[1] * 0.85, 0.002), "shell", parent)
        else:
            walk_surface(solid, parent, size)
    transmitter()
    scene["fixtureHash"] = LAYOUT["fixtureHash"]
    scene["reviewTreatment"] = treatment
    scene["humanAccepted"] = False
    scene["releaseEligible"] = False
    scene["externalPayloadInputs"] = "none"

    # A named camera makes the editable source inspectable at the real game view.
    camera_data = bpy.data.cameras.new("Relay west A gameplay camera FOV78")
    camera_data.sensor_fit = "VERTICAL"
    camera_data.lens = camera_data.sensor_height / (2 * math.tan(math.radians(78) / 2))
    camera = bpy.data.objects.new("RELAY_REVIEW_WEST_A_CAMERA", camera_data)
    scene.collection.objects.link(camera)
    camera.location = vector(-29, 1.7, 0)
    camera.rotation_euler = Vector((1, 0, 0)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 1707, 863
    scene.render.resolution_percentage = 100
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f"relay-{treatment}.blend"))

    # Apply authored modifiers and world transforms, then batch by material.
    bpy.context.view_layer.update()
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    batches = {
        role: [obj for obj in meshes if obj.data.materials[0] == mat]
        for role, mat in MATERIALS.items()
    }
    for role, batch in batches.items():
        for obj in batch:
            obj.select_set(True)
        if batch:
            bpy.context.view_layer.objects.active = batch[0]
            bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = "RELAY_RESET_BATCH_" + role.upper()
            joined["noHit"] = True
            joined["renderMeshesMayBeAuthority"] = False
            joined["sourceAnchorCount"] = len(LAYOUT["fixture"]["solids"])
        bpy.ops.object.select_all(action="DESELECT")
    runtime_meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    triangles = 0
    for obj in runtime_meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        obj.select_set(True)
    glb_path = OUTPUT / f"relay-{treatment}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_texcoords=False,
        export_normals=True, export_materials="EXPORT", export_extras=True,
        export_animations=False, export_cameras=False, export_lights=False,
    )
    return {
        "treatment": treatment,
        "fixtureHash": LAYOUT["fixtureHash"],
        "authorityColliderCount": len(LAYOUT["fixture"]["solids"]),
        "sourceObjectCount": len(meshes),
        "runtimeMeshCount": len(runtime_meshes),
        "triangles": triangles,
        "materialCount": len(MATERIALS),
        "textureCount": 0,
        "fileBytes": glb_path.stat().st_size,
        "sha256": hashlib.sha256(glb_path.read_bytes()).hexdigest(),
        "blendSha256": hashlib.sha256((SOURCE / f"relay-{treatment}.blend").read_bytes()).hexdigest(),
        "stage": "isolated-candidate",
        "humanAccepted": False,
        "releaseEligible": False,
        "runtimeProof": "pending",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--treatment", choices=TREATMENTS)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    chosen = (args.treatment,) if args.treatment else TREATMENTS
    manifests = [export_treatment(treatment) for treatment in chosen]
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1,
        "tool": "Blender " + bpy.app.version_string,
        "source": str(SOURCE.relative_to(ROOT)),
        "externalInputs": [],
        "candidates": manifests,
    }, indent=2) + "\n", encoding="utf-8")
    print("RELAY_RESET_EXPORT " + json.dumps(manifests))
