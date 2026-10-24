# Renders turnaround previews of a character glb with Workbench (flat, textured): front / 3-4 / side / back in one PNG.
#   blender --background --python tools/blender/render_preview.py -- in.glb out.png [pose]
import bpy, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
pose = (a[2] if len(a) > 2 else 'rest')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)


def rot_about_head(pb, axis, deg):
    h = arm.matrix_world @ pb.head
    R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h)
    pb.matrix = R @ pb.matrix
    bpy.context.view_layer.update()


if arm and pose == 'stand':                      # arms down a bit, knees slightly bent: a readable idle
    P = arm.pose.bones
    for s, sf in ((1, '_l'), (-1, '_r')):
        rot_about_head(P['upperarm' + sf], 'Y', s * 74)          # arms down, elbows a touch out
        rot_about_head(P['upperarm' + sf], 'X', 6)
        rot_about_head(P['lowerarm' + sf], 'X', -22)             # elbows bend forward
        rot_about_head(P['lowerarm' + sf], 'Y', -s * 8)          # forearms angle in
        rot_about_head(P['hand' + sf], 'Y', -s * 14)             # wrists turn in
        rot_about_head(P['thigh' + sf], 'Y', -s * 4)             # relaxed, slightly wide stance
        rot_about_head(P['calf' + sf], 'Y', s * 4)
    rot_about_head(P['spine_02'], 'X', 3)
    rot_about_head(P['neck_01'], 'X', -4)

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'FLAT'; sh.color_type = 'TEXTURE'; sh.show_object_outline = True; sh.object_outline_color = (0.05, 0.04, 0.07)
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.72, 0.9, 0.78)
sc.render.resolution_x, sc.render.resolution_y = 520, 900
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.55
sc.collection.objects.link(cam); sc.camera = cam
imgs = []
for name, ang in (('front', 0), ('q', 40), ('side', 90), ('back', 180)):
    r = 6.0
    cam.location = Vector((0, 0, 1.08))
    cam.location.x = math.sin(math.radians(ang)) * r
    cam.location.y = -math.cos(math.radians(ang)) * r
    cam.location.z = 1.08
    d = Vector((0, 0, 1.08)) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    p = os.path.join(os.path.dirname(out), f'_t_{name}.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(p)
    arr = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(arr)
    imgs.append(arr.reshape(im.size[1], im.size[0], 4)); os.remove(p)
sheet = np.hstack(imgs)
res = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0], alpha=True)
res.pixels.foreach_set(sheet.ravel()); res.filepath_raw = out; res.file_format = 'PNG'; res.save()
print('PREVIEW', out)
