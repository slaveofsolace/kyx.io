"""Author isolated Relay family treatments from inspected CC0 derivatives.

The actor anatomy/rig/motion and rifle lineage remain credited in README.md.
No source file is overwritten. All visible additions are editable meshes.
Run with Blender --background --factory-startup --disable-autoexec --python.
"""
import bpy
import bmesh
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path.cwd()
SOURCE = ROOT / 'assets/review/runtime-candidates'
OUT = ROOT / 'assets/review/runtime-candidates/relay-reset-family'
EDITABLE = ROOT / 'assets/source/blender/relay-reset-family'
OUT.mkdir(parents=True, exist_ok=True)
TREATMENTS = ('deck', 'campus', 'workshop')
UAL_SOURCE = Path('D:/AI Projects/Projects/Games/evio/resource-quarantine-20260802/quaternius-universal-animation/UAL1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb')
REPORT = {'schema': 'kyx-relay-family-review-v1', 'blender': bpy.app.version_string,
          'humanAccepted': False, 'releaseEligible': False, 'sourceDisposition': 'ADAPT', 'treatments': {}}


def linear(hex_value):
    values = [int(hex_value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, color, metal=.08, rough=.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear(color), 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    mat.diffuse_color = (*linear(color), 1)
    return mat


def palette(treatment):
    return {
        'shell': material('KYX_RELAY_' + treatment.upper() + '_CERAMIC_ARMOR', 'c9c6b7', .08, .69),
        'flex': material('KYX_RELAY_GRAPHITE_FABRIC', '343a3b', .02, .88),
        'glove': material('KYX_RELAY_GLOVE_RUBBER', '242b2e', .01, .83),
        'alloy': material('KYX_RELAY_LOAD_ALLOY', '67706f', .35, .56),
        'ochre': material('KYX_RELAY_OCHRE_RELEASE', 'b28c42', .08, .72),
        'visor': material('KYX_RELAY_DARK_VISOR', '193943', .16, .36),
    }


def mesh_object(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + '_MESH')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def plate(name, contour_xz, front_y, depth, mat, bevel=.004):
    verts = [(x, front_y, z) for x, z in contour_xz] + [(x, front_y+depth, z) for x, z in contour_xz]
    n = len(contour_xz)
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    obj = mesh_object(name, verts, faces, mat)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new('Soft protective edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    return obj


def bind(obj, rig, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Shared family rig', 'ARMATURE')
    mod.object = rig


def source_materials(meshes, mats, treatment):
    for obj in meshes:
        for index, old in enumerate(obj.data.materials):
            name = old.name
            if 'VISOR' in name:
                replacement = mats['visor']
            elif 'GLOVE' in name:
                replacement = mats['glove']
            elif 'BLUE_ARMOR' in name:
                replacement = mats['shell'] if treatment == 'campus' else mats['alloy']
            elif 'KNEE' in name:
                replacement = mats['alloy']
            else:
                replacement = mats['flex']
            obj.data.materials[index] = replacement


def lock_donor_gloves(meshes):
    """Keep donor glove topology coherent when inherited finger retarget stretches it.

    This deliberately makes the donor's already-curled glove a rigid hand surface.
    It is not a per-finger contact/animation claim.
    """
    repaired = 0
    for obj in meshes:
        group_names = {group.index: group.name for group in obj.vertex_groups}
        for vertex in obj.data.vertices:
            influences = [(group_names[g.group], g.weight) for g in vertex.groups]
            for side in ('l', 'r'):
                weight = sum(w for n, w in influences if n == 'hand_' + side or
                             (n.endswith('_'+side) and n.split('_')[0] in ('index','middle','ring','pinky','thumb')))
                if weight > .55:
                    for group in obj.vertex_groups:
                        try:
                            group.remove([vertex.index])
                        except RuntimeError:
                            pass
                    obj.vertex_groups.get('hand_'+side).add([vertex.index], 1, 'REPLACE')
                    repaired += 1
                    break
    return repaired


def is_arm(name):
    return name.split('_')[0] in ('upperarm','lowerarm','hand','index','middle','ring','pinky','thumb')


def read_compatible_arm_source():
    assert hashlib.sha256(UAL_SOURCE.read_bytes()).hexdigest() == '69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(UAL_SOURCE))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    names={g.index:g.name for g in obj.vertex_groups}
    weights=[[(names[g.group],g.weight) for g in v.groups if g.weight>0] for v in obj.data.vertices]
    arm_weight=[sum(w for n,w in v if is_arm(n)) for v in weights]
    faces=[list(p.vertices) for p in obj.data.polygons if min(arm_weight[i] for i in p.vertices)>.46]
    used=sorted({i for f in faces for i in f})
    remap={old:new for new,old in enumerate(used)}
    matrix=rig.matrix_world.inverted()@obj.matrix_world
    return {'vertices':[matrix@obj.data.vertices[i].co for i in used],
        'faces':[[remap[i] for i in face] for face in faces],
        'weights':[weights[i] for i in used],
        'bones':{b.name:(b.matrix_local.copy(),b.length) for b in rig.data.bones}}


def graft_compatible_arms(rig,meshes,mats,arm_source):
    # Remove only the inherited arm/hand region. Preserve torso, head and legs.
    for obj in list(meshes):
        names={g.index:g.name for g in obj.vertex_groups}
        arm_weights=[sum(g.weight for g in v.groups if is_arm(names[g.group])) for v in obj.data.vertices]
        bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
        doomed=[face for face in bm.faces if sum(arm_weights[v.index] for v in face.verts)/len(face.verts)>.48]
        bmesh.ops.delete(bm,geom=doomed,context='FACES')
        bm.to_mesh(obj.data);bm.free();obj.data.update()
    transforms={}
    for name,(source_matrix,length) in arm_source['bones'].items():
        if name not in rig.data.bones: continue
        target=rig.data.bones[name]
        ratio=target.length/max(length,.0001)
        transforms[name]=target.matrix_local@Matrix.Diagonal((ratio,ratio,ratio,1))@source_matrix.inverted()
    vertices=[]
    for point,weights in zip(arm_source['vertices'],arm_source['weights']):
        mapped=Vector((0,0,0));total=0
        for name,weight in weights:
            if name in transforms:
                mapped+=(transforms[name]@point)*weight;total+=weight
        vertices.append(tuple(mapped/max(total,.0001)))
    arms=mesh_object('RELAY_SHARED_UAL_ARMS_AND_GLOVES',vertices,arm_source['faces'],mats['shell'])
    arms.data.materials.append(mats['flex']);arms.data.materials.append(mats['glove'])
    for index,weights in enumerate(arm_source['weights']):
        for name,weight in weights:
            if name not in rig.data.bones:continue
            group=arms.vertex_groups.get(name) or arms.vertex_groups.new(name=name)
            group.add([index],weight,'REPLACE')
    for face in arms.data.polygons:
        hand_weight=sum(sum(w for n,w in arm_source['weights'][i] if is_arm(n) and not n.startswith(('upperarm','lowerarm'))) for i in face.vertices)/len(face.vertices)
        upper_weight=sum(sum(w for n,w in arm_source['weights'][i] if n.startswith('upperarm')) for i in face.vertices)/len(face.vertices)
        face.material_index=2 if hand_weight>.45 else 1 if upper_weight>.7 else 0
        face.use_smooth=True
    arms.parent=rig;mod=arms.modifiers.new('Shared family arm skin','ARMATURE');mod.object=rig
    meshes.append(arms)
    return len(vertices)


def armor_additions(rig, mats, treatment):
    additions = []
    if treatment == 'campus':
        # Continuous compression face follows the upper rib cage and clears the belt.
        additions.append((plate('RELAY_CERAMIC_CHEST_COMPRESSION_FACE',
            [(-.171,1.39),(-.122,1.445),(.112,1.445),(.158,1.39),(.137,1.24),(.075,1.20),(-.10,1.20),(-.157,1.26)],
            -.123,.029,mats['shell'],.009), 'spine_03'))
        additions.append((plate('RELAY_CHEST_RECESSED_SERVICE_TAB',
            [(-.084,1.295),(-.062,1.307),(-.006,1.307),(.002,1.284),(-.076,1.277)],
            -.157,.013,mats['ochre'],.002), 'spine_03'))
        additions.append((plate('RELAY_SHORT_VISOR_BROW',
            [(-.112,1.679),(-.07,1.70),(.071,1.70),(.112,1.677),(.102,1.651),(-.108,1.651)],
            -.116,.044,mats['shell'],.005), 'Head'))
    elif treatment == 'deck':
        for side in (-1,1):
            contour = [(side*x,z) for x,z in [( .105,1.448),(.154,1.412),(.148,1.222),(.104,1.20),(.089,1.244),(.106,1.363)]]
            additions.append((plate('RELAY_DECK_HARNESS_' + str(side), contour,
                                    -.135,.024,mats['shell'],.005),'spine_03'))
            additions.append((plate('RELAY_DECK_QUICK_RELEASE_' + str(side),
                [(side*.09,1.326),(side*.143,1.326),(side*.143,1.298),(side*.09,1.298)],
                -.162,.014,mats['ochre'],.002),'spine_03'))
        additions.append((plate('RELAY_DECK_COLLAR_BRIDGE',
            [(-.148,1.455),(-.10,1.505),(-.083,1.505),(-.10,1.466),(.09,1.466),(.108,1.505),(.13,1.505),(.149,1.455)],
            -.067,.026,mats['shell'],.004),'spine_03'))
    else:
        additions.append((plate('RELAY_WORKSHOP_SERVICE_YOKE',
            [(-.154,1.406),(-.105,1.449),(.12,1.437),(.167,1.37),(.13,1.31),(.046,1.338),(-.071,1.319),(-.157,1.343)],
            -.139,.038,mats['shell'],.007),'spine_03'))
        additions.append((plate('RELAY_WORKSHOP_BODY_INTERFACE',
            [(-.152,1.275),(-.085,1.29),(-.067,1.18),(-.148,1.18),(-.164,1.21)],
            -.127,.033,mats['alloy'],.006),'spine_02'))
        additions.append((plate('RELAY_WORKSHOP_INTERFACE_LATCH',
            [(-.144,1.27),(-.103,1.277),(-.099,1.251),(-.142,1.245)],
            -.166,.012,mats['ochre'],.002),'spine_02'))
    for obj, bone in additions:
        bind(obj,rig,bone)
    return [obj for obj,_ in additions]


def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def export(filepath, objects, animations=True):
    select_only(objects)
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format='GLB', use_selection=True,
        export_animations=animations, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_skins=True, export_all_influences=False, export_extras=True,
        export_copyright='Actor mesh adapted from Irondust CC0 Sci-fi Soldier; motion subset adapted from Quaternius CC0 UAL1/2. Rifle adapted from Quaternius CC0 Sci-Fi Gun Pack. Relay treatment and contact derivative by KYX.IO. Review only; human acceptance pending.')
    data=filepath.read_bytes()
    doc=json.loads(data[20:20+int.from_bytes(data[12:16],'little')])
    prims=[p for m in doc.get('meshes',[]) for p in m['primitives']]
    return {'path':str(filepath.relative_to(ROOT)).replace('\\','/'), 'bytes':len(data),
        'sha256':hashlib.sha256(data).hexdigest(), 'triangles':sum(doc['accessors'][p['indices']]['count']//3 for p in prims),
        'primitives':len(prims), 'bones':len(doc.get('skins',[{'joints':[]}])[0]['joints']),
        'animations':[a['name'] for a in doc.get('animations',[])], 'images':len(doc.get('images',[]))}


def activate(rig, prefix):
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute=True
    action=next(a for a in bpy.data.actions if a.name.startswith(prefix))
    rig.animation_data.action=action
    if action.slots:
        rig.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def import_actor(lod,treatment):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / 'g6-assault-rev40-cc0-weapon-ready-v4' / f'character-lod{lod}.glb'))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    mats=palette(treatment)
    source_materials(meshes,mats,treatment)
    repaired=graft_compatible_arms(rig,meshes,mats,ARM_SOURCE)
    additions=armor_additions(rig,mats,treatment)
    rig['relayResetFamily']=treatment
    rig['humanAccepted']=False
    rig['releaseEligible']=False
    return rig,meshes+additions,mats,repaired


def render_inspection(treatment,rig):
    scene=bpy.context.scene
    activate(rig,'KYX_REV17_TP_IDLE')
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.render.resolution_x=1000
    scene.render.resolution_y=1000
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('RelayInspectionWorld')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.14,.15,.16,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    for name,loc,energy,size in [('key',(3,-4,5),450,4),('fill',(-3,-1,2.5),160,4),('rim',(0,3,4),300,3)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.size=size
        obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('InspectionCamera',bpy.data.cameras.new('InspectionCamera'))
    scene.collection.objects.link(cam);cam.location=(2.8,-4.2,2.15)
    cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.4;scene.camera=cam
    scene.render.filepath=str(EDITABLE / f'{treatment}-actor-source-view.png')
    bpy.ops.render.render(write_still=True)


def build_rifle(treatment):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE/'kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb'))
    root=next(o for o in bpy.context.scene.objects if o.parent is None)
    mats=palette(treatment)
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH': continue
        for index,old in enumerate(obj.data.materials):
            obj.data.materials[index]=mats['shell' if 'MAIN' in old.name else 'ochre' if 'DETAIL' in old.name else 'alloy' if 'BARREL' in old.name else 'flex']
    # Author in final weapon coordinates. Original donor/root transform is preserved.
    # Each contour is a side panel in longitudinal weapon space, clear of the reflex.
    # Blender (x,y,z) corresponds to game (x,z,-y): barrel points Blender +Y.
    if treatment=='campus':
        shape=[(-.02,.07),(.08,.045),(.55,.065),(.61,.10),(.55,.178),(.04,.182),(-.055,.135)]
    elif treatment=='deck':
        shape=[(-.015,.08),(.045,.056),(.15,.062),(.18,.176),(.08,.183),(-.04,.135)]
    else:
        shape=[(-.04,.074),(.08,.051),(.34,.062),(.42,.109),(.28,.187),(.02,.171)]
    def side_panel(name, points, x, thick, mat):
        n=len(points)
        verts=[(x,y,z) for y,z in points]+[(x+thick,y,z) for y,z in points]
        faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        obj=mesh_object(name,verts,faces,mat)
        mod=obj.modifiers.new('Cast edge','BEVEL');mod.width=.008;mod.segments=3
        select_only([obj]);bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.parent=root;obj.matrix_parent_inverse=root.matrix_world.inverted()
        return obj
    bpy.context.view_layer.update()
    for sign in (-1,1):
        side_panel('RELAY_RIFLE_SERVICE_SHROUD_'+str(sign),shape,sign*.053,sign*.013,mats['shell'])
        if treatment=='deck':
            side_panel('RELAY_DECK_FORWARD_BRIDGE_'+str(sign),[(.37,.072),(.45,.065),(.55,.10),(.53,.17),(.39,.175)],sign*.053,sign*.013,mats['shell'])
        side_panel('RELAY_RIFLE_RELEASE_'+str(sign),[(.06,.12),(.112,.12),(.112,.138),(.06,.138)],sign*.069,sign*.005,mats['ochre'])
    root['relayResetFamily']=treatment
    root['humanAccepted']=False
    root['releaseEligible']=False
    bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE/f'{treatment}-rifle.blend'),compress=True)
    return export(OUT/f'{treatment}-rifle.glb',list(bpy.context.scene.objects),False)


ARM_SOURCE=read_compatible_arm_source()
for treatment in TREATMENTS:
    entry={'lods':[]}
    for lod in (0,1,2):
        rig,meshes,mats,repaired=import_actor(lod,treatment)
        activate(rig,'KYX_REV17_TP_IDLE')
        if lod==0:
            bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE/f'{treatment}-actor.blend'),compress=True)
        entry['lods'].append(export(OUT/f'{treatment}-character-lod{lod}.glb',[rig,*meshes]))
        if lod==0:
            entry['rigidGloveVertices']=repaired
            render_inspection(treatment,rig)
    entry['rifle']=build_rifle(treatment)
    REPORT['treatments'][treatment]=entry
(OUT/'manifest.json').write_text(json.dumps(REPORT,indent=2)+'\n',encoding='utf-8')
print(json.dumps(REPORT))
