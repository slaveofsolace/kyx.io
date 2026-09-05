"""Read preserved GLBs through Blender without enabling donor scripts."""
import bpy
import json
import sys
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path.cwd()
OUT = ROOT / 'assets/source/blender/relay-reset-family'
SOURCE = ROOT / 'assets/review/runtime-candidates/g6-assault-rev40-cc0-weapon-ready-v4/character-lod0.glb'
IS_UAL = '--ual' in sys.argv
if IS_UAL:
    SOURCE = Path('D:/AI Projects/Projects/Games/evio/resource-quarantine-20260802/quaternius-universal-animation/UAL1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb')
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == '69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('InspectionWorld')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.14, 0.15, 0.16, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
scene.view_settings.view_transform = 'AgX'
rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
idle = next(action for action in bpy.data.actions if action.name.startswith('Pistol_Idle_Loop' if IS_UAL else 'KYX_REV17_TP_IDLE'))
rig.animation_data_create()
for track in rig.animation_data.nla_tracks:
    track.mute = True
rig.animation_data.action = idle
if hasattr(idle, 'slots') and idle.slots:
    rig.animation_data.action_slot = idle.slots[0]
scene.frame_set(1)
bpy.context.view_layer.update()
report = {
  'blender': bpy.app.version_string,
  'rig': rig.name,
  'units': scene.unit_settings.scale_length,
  'actions': [{'name': a.name, 'frames': list(a.frame_range), 'slots': [s.identifier for s in a.slots]} for a in bpy.data.actions],
  'objects': [{'name': o.name, 'type': o.type, 'dimensions': list(o.dimensions), 'location': list(o.location), 'scale': list(o.scale),
    'modifiers': [m.type for m in o.modifiers], 'materials': [m.name for m in o.data.materials] if o.type == 'MESH' else [],
    'polygons': len(o.data.polygons) if o.type == 'MESH' else 0} for o in scene.objects],
  'bones': [{'name': b.name, 'head': list(b.head_local), 'tail': list(b.tail_local),
    'posedHead': list(rig.pose.bones[b.name].head), 'posedTail': list(rig.pose.bones[b.name].tail)} for b in rig.data.bones],
  'drivers': sum(len(o.animation_data.drivers) for o in scene.objects if o.animation_data),
  'linkedLibraries': [lib.filepath for lib in bpy.data.libraries],
  'sourceScriptsExecuted': False,
}
(OUT / ('ual-blender-inspection.json' if IS_UAL else 'blender-inspection.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
for name, loc, energy, size in [('key', (3,-4,5), 450, 4), ('fill', (-3,-1,2.5), 160, 4), ('rim', (0,3,4), 300, 3)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.shape = 'DISK'
    light.size = size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0,0,1)) - obj.location).to_track_quat('-Z','Y').to_euler()
cam_data = bpy.data.cameras.new('InspectionCamera')
cam = bpy.data.objects.new('InspectionCamera', cam_data)
scene.collection.objects.link(cam)
cam.location = (2.8, -4.2, 2.15)
cam.rotation_euler = (Vector((0,0,0.95)) - cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.4
scene.camera = cam
scene.render.filepath = str(OUT / ('ual-preserved-mesh-baseline.png' if IS_UAL else 'preserved-actor-baseline.png'))
bpy.ops.render.render(write_still=True)
print(json.dumps({'rig': rig.name, 'bones': len(rig.data.bones), 'actions': len(bpy.data.actions), 'render': scene.render.filepath}))
