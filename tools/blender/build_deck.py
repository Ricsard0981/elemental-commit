# PYRE'S DECK: the purple "IGNITE" board, exported as assets/hero/pyre_deck.glb (one mesh, the shared atlas).
#   blender --background --python tools/blender/build_deck.py [-- out.glb]
# Concave popsicle shape with kicked nose/tail, grip on top, the graffiti graphic underneath, edge walls, two trucks, four wheels.
# Blender axes: the board runs along Y (nose at -Y), grip faces +Z; in glTF that is length along Z, grip up (+Y).
import bpy, bmesh, math, json, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, 'assets', 'hero', 'pyre_deck.glb')
ATLAS = json.load(open(os.path.join(HERE, 'atlas.json')))
S, CELLS = ATLAS['size'], ATLAS['cells']

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
UV = bm.loops.layers.uv.new('UVMap')


def cuv(name):
    x, y, w, h = CELLS[name]
    return ((x + w / 2) / S, 1 - (y + h / 2) / S)


def paint(faces, name):
    uv = cuv(name)
    for f in faces:
        for l in f.loops: l[UV].uv = uv


L, W, NU, NV, TH = .8, .21, 6, 24, .014


def P(i, j, top):
    u, v = i / NU - .5, j / NV - .5
    t = abs(v) * 2
    half = W / 2 * (1 - max(0.0, (t - .78) / .22) ** 2 * .55)            # rounded nose and tail
    z = max(0.0, t - .74) ** 1.6 * .38 + (u * 2) ** 2 * .008 + (0.0 if top else -TH)
    return Vector((u * 2 * half, v * L, z))


grids = {}
for top in (True, False):
    x0, y0, cw, ch = CELLS['grip' if top else 'deck']
    g = [[bm.verts.new(P(i, j, top)) for i in range(NU + 1)] for j in range(NV + 1)]
    grids[top] = g
    for j in range(NV):
        for i in range(NU):
            q = (g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]) if top else (g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1])
            f = bm.faces.new(q)
            f.smooth = True
            for l in f.loops:
                jj, ii = [(a, b) for a in (j, j + 1) for b in (i, i + 1) if g[a][b] is l.vert][0]
                if top: l[UV].uv = ((x0 + 2 + (cw - 4) * ii / NU) / S, 1 - (y0 + 2 + (ch - 4) * jj / NV) / S)
                else: l[UV].uv = ((x0 + 2 + (cw - 4) * (1 - ii / NU)) / S, 1 - (y0 + 2 + (ch - 4) * (1 - jj / NV)) / S)
# edge walls round the perimeter
gt, gb = grids[True], grids[False]
ring_idx = [(0, i) for i in range(NU)] + [(j, NU) for j in range(NV)] + [(NV, i) for i in range(NU, 0, -1)] + [(j, 0) for j in range(NV, 0, -1)]
walls = []
for k in range(len(ring_idx)):
    (ja, ia), (jb, ib) = ring_idx[k], ring_idx[(k + 1) % len(ring_idx)]
    walls.append(bm.faces.new((gt[ja][ia], gb[ja][ia], gb[jb][ib], gt[jb][ib])))
bmesh.ops.recalc_face_normals(bm, faces=walls)
paint(walls, 'purple')


def part(geom, name):
    vs = geom['verts']
    faces = list({f for v in vs for f in v.link_faces})
    paint(faces, name)
    return faces


for e in (-1, 1):                                                         # trucks: baseplate, hanger, axle, two wheels
    y = e * .27
    part(bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, y, -TH - .008)) @ Matrix.Diagonal((.06, .09, .016, 1))), 'silver')
    part(bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, y + e * .01, -TH - .032)) @ Matrix.Diagonal((.15, .035, .03, 1))), 'silver')
    part(bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.006, radius2=.006, depth=.2, matrix=Matrix.Translation((0, y + e * .01, -TH - .045)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()), 'silver')
    for k in (-1, 1):
        part(bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.03, radius2=.03, depth=.036, matrix=Matrix.Translation((k * .092, y + e * .01, -TH - .045)) @ Euler((0, math.pi / 2, 0)).to_matrix().to_4x4()), 'yellow')

me = bpy.data.meshes.new('PyreDeck')
bm.to_mesh(me); bm.free()
o = bpy.data.objects.new('PyreDeck', me)
bpy.context.scene.collection.objects.link(o)
img = bpy.data.images.load(os.path.join(HERE, 'atlas.png'))
m = bpy.data.materials.new('PyreDeck')
m.use_nodes = True
tex = m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
m.node_tree.links.new(tex.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
me.materials.append(m)
print('DECK tris', sum(len(p.vertices) - 2 for p in me.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_yup=True, export_texcoords=True, export_normals=True,
                          export_cameras=False, export_lights=False, export_image_format='AUTO')
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB')
