# usage: blender --background --python tools/blender/inspect_rig.py -- assets/hero/body_m.glb
import bpy, sys, mathutils
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for o in bpy.data.objects:
    print('OBJ', o.type, o.name, tuple(round(v, 3) for v in o.location), tuple(round(v, 3) for v in o.scale), o.parent.name if o.parent else None)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print('BONES', len(arm.data.bones))
for b in arm.data.bones:
    h = arm.matrix_world @ b.head_local; t = arm.matrix_world @ b.tail_local
    print('B', b.name, 'parent=', b.parent.name if b.parent else None, 'head', tuple(round(v, 3) for v in h), 'tail', tuple(round(v, 3) for v in t))
for o in bpy.data.objects:
    if o.type == 'MESH':
        bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        print('MESH', o.name, 'verts', len(o.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'minmax', tuple(round(min(v[i] for v in bb), 3) for i in range(3)), tuple(round(max(v[i] for v in bb), 3) for i in range(3)), 'mats', [m.name for m in o.data.materials], 'vg', len(o.vertex_groups))
