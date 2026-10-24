# prints body cross-section extents per height so garments can be fitted (run: blender --background --python tools/blender/measure_body.py)
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'C:\programok\ELEMENT_GAME\assets\hero\body_m.glb')
body = bpy.data.objects['SuperHero_Male']
vs = [body.matrix_world @ v.co for v in body.data.vertices]
def sl(z, dz, xmin=-9, xmax=9, name=''):
    pts = [v for v in vs if abs(v.z - z) < dz and xmin <= v.x <= xmax]
    if not pts: print('SL', name, z, 'none'); return
    print('SL', name, 'z=%.2f' % z, 'x[%.3f %.3f] y[%.3f %.3f] n=%d' % (min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts), len(pts)))
for z in (1.75, 1.7, 1.65, 1.6, 1.55): sl(z, 0.015, -0.3, 0.3, 'head/neck')
for z in (1.5, 1.45, 1.4, 1.35, 1.3, 1.2, 1.1, 1.0): sl(z, 0.015, -0.26, 0.26, 'torso')
for z in (0.95, 0.85, 0.7, 0.54, 0.4, 0.25, 0.12, 0.05): sl(z, 0.02, 0.0, 0.35, 'leftleg')
for x in (0.3, 0.45, 0.6, 0.7): 
    pts = [v for v in vs if abs(v.x - x) < 0.02 and v.z > 1.2]
    if pts: print('ARM x=%.2f z[%.3f %.3f] y[%.3f %.3f]' % (x, min(p.z for p in pts), max(p.z for p in pts), min(p.y for p in pts), max(p.y for p in pts)))
pts = [v for v in vs if v.z < 0.1 and v.x > 0]
print('FOOT x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f]' % (min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts), min(p.z for p in pts), max(p.z for p in pts)))
