# A look-dev "photo" of Pyre: sitting on a graffiti funbox in front of a brick wall at night, sodium street lights + a camera flash,
# toon-banded shading with ink outlines. Not a game asset, only an aesthetic test of the model.
#   blender --background --python tools/blender/photo_pyre.py -- out.png [samples]
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = a[0] if a else os.path.join(HERE, 'pyre_photo.png')
SAMPLES = int(a[1]) if len(a) > 1 else 48
ATLAS = json.load(open(os.path.join(HERE, 'atlas.json')))
S, CELLS = ATLAS['size'], ATLAS['cells']
FONT = 'C:/Windows/Fonts/impact.ttf'
RNG = random.Random(3)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ATL = bpy.data.images.load(os.path.join(HERE, 'atlas.png'))


def hexc(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4) for x in c) + (a,)


# ---------------------------------------------------------------- toon material: banded light, keeps the light's colour
def toon(name, color=None, image=None, emit=0.0, uvmap=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    N, L = nt.nodes.new, nt.links.new
    out = N('ShaderNodeOutputMaterial')
    diff = N('ShaderNodeBsdfDiffuse'); diff.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = N('ShaderNodeShaderToRGB'); L(diff.outputs[0], s2r.inputs[0])
    bw = N('ShaderNodeRGBToBW'); L(s2r.outputs['Color'], bw.inputs[0])
    ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, (.14, .13, .2, 1)
    el[1].position, el[1].color = .05, (.42, .4, .5, 1)
    e3 = el.new(.22); e3.color = (.8, .8, .82, 1)
    e4 = el.new(.55); e4.color = (1.05, 1.05, 1.05, 1)
    L(bw.outputs[0], ramp.inputs[0])
    # tint = (light + e) / (luma + e): the hue of whatever light hits the surface
    add = N('ShaderNodeVectorMath'); add.operation = 'ADD'; add.inputs[1].default_value = (.03, .03, .03)
    L(s2r.outputs['Color'], add.inputs[0])
    sep = N('ShaderNodeSeparateColor'); L(s2r.outputs['Color'], sep.inputs[0])
    mx1 = N('ShaderNodeMath'); mx1.operation = 'MAXIMUM'; L(sep.outputs[0], mx1.inputs[0]); L(sep.outputs[1], mx1.inputs[1])
    mx2 = N('ShaderNodeMath'); mx2.operation = 'MAXIMUM'; L(mx1.outputs[0], mx2.inputs[0]); L(sep.outputs[2], mx2.inputs[1])
    adds = N('ShaderNodeMath'); adds.operation = 'ADD'; adds.inputs[1].default_value = .03; L(mx2.outputs[0], adds.inputs[0])
    div = N('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; L(add.outputs[0], div.inputs[0]); L(adds.outputs[0], div.inputs[1])
    lit = N('ShaderNodeMix'); lit.data_type = 'RGBA'; lit.blend_type = 'MULTIPLY'; lit.inputs['Factor'].default_value = 1.0
    L(ramp.outputs['Color'], lit.inputs[6]); L(div.outputs[0], lit.inputs[7])
    mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    if image:
        tex = N('ShaderNodeTexImage'); tex.image = image; tex.interpolation = 'Closest' if image is ATL else 'Linear'
        if uvmap:
            uvn = N('ShaderNodeUVMap'); uvn.uv_map = uvmap; L(uvn.outputs[0], tex.inputs[0])
        base = tex.outputs['Color']
    elif callable(color):
        base = color(nt)
    else:
        rgb = N('ShaderNodeRGB'); rgb.outputs[0].default_value = color; base = rgb.outputs[0]
    L(base, mul.inputs[6]); L(lit.outputs[2], mul.inputs[7])
    em = N('ShaderNodeEmission'); L(mul.outputs[2], em.inputs['Color'])
    if emit:
        em2 = N('ShaderNodeEmission'); L(base, em2.inputs['Color']); em2.inputs['Strength'].default_value = emit
        addsh = N('ShaderNodeAddShader'); L(em.outputs[0], addsh.inputs[0]); L(em2.outputs[0], addsh.inputs[1]); L(addsh.outputs[0], out.inputs[0])
    else:
        L(em.outputs[0], out.inputs[0])
    return m


INK = bpy.data.materials.new('ink')
INK.use_nodes = True
INK.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)
for n in list(INK.node_tree.nodes):
    if n.type == 'BSDF_PRINCIPLED': INK.node_tree.nodes.remove(n)
ie = INK.node_tree.nodes.new('ShaderNodeEmission'); ie.inputs['Color'].default_value = hexc('#0c0a12'); ie.inputs['Strength'].default_value = 1
INK.node_tree.links.new(ie.outputs[0], INK.node_tree.nodes['Material Output'].inputs[0])
INK.use_backface_culling = True
INK.use_backface_culling_shadow = True                 # the inverted-hull shell must not shadow what it wraps


def outline(o, th=.012):
    if o.type not in ('MESH', 'CURVE', 'FONT'): return
    if o.type != 'MESH': return
    o.data.materials.append(INK)
    m = o.modifiers.new('ink', 'SOLIDIFY')
    m.thickness, m.offset, m.use_flip_normals, m.use_rim = th, 1.0, True, False
    m.material_offset = len(o.data.materials) - 1


def obj_from_bm(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = False
    return o


def box(name, loc, size, mat, rot=(0, 0, 0), ink=.012):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1)))
    o = obj_from_bm(name, bm, [mat]); outline(o, ink); return o


def cyl(name, loc, r, depth, mat, rot=(0, 0, 0), seg=16, ink=.01, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth, matrix=Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4())
    o = obj_from_bm(name, bm, [mat])
    for p in o.data.polygons: p.use_smooth = True
    outline(o, ink); return o


def cell_plane(name, cell, loc, w, h, rot, ink=.006, emit=0.0):
    """a quad textured with one atlas cell (stickers, posters)"""
    x0, y0, cw, ch = CELLS[cell]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(Vector(p)) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new((vs[0], vs[3], vs[2], vs[1]))   # normal -Y
    uvs = {vs[0]: (x0, y0 + ch), vs[1]: (x0 + cw, y0 + ch), vs[2]: (x0 + cw, y0), vs[3]: (x0, y0)}
    for l in f.loops:
        px, py = uvs[l.vert]; l[uv].uv = ((px + .5 * (1 if px == x0 else -1)) / S, 1 - (py + .5 * (1 if py == y0 else -1)) / S)
    o = obj_from_bm(name, bm, [STICK if not emit else toon('stk_e', image=ATL, emit=emit)])
    o.location, o.rotation_euler = loc, rot
    outline(o, ink); return o


def text(body, loc, size, mat, rot=(math.pi / 2, 0, 0), extrude=.012, offset=0.0, shear=0.0, name='txt'):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True); cu.size = size; cu.extrude = extrude; cu.offset = offset; cu.shear = shear
    cu.align_x, cu.align_y = 'CENTER', 'CENTER'
    o = bpy.data.objects.new(name, cu); sc.collection.objects.link(o)
    o.location, o.rotation_euler = loc, rot
    cu.materials.append(mat)
    return o


STICK = toon('sticker', image=ATL)

# ---------------------------------------------------------------- materials for the set
M = {k: toon(k, hexc(v)) for k, v in dict(asphalt='#2b2a33', concrete='#8d8a8f', ply='#c99a5e', plyDark='#8a6236', coping='#cfd6e4', cone='#ff6a1a',
                                           white='#f2ece4', crate='#19a7e3', crateB='#ff2e93', tv='#d9d4c8', tvDark='#3a3d45', black='#14121a', pole='#3b3f4a',
                                           lime='#c6ff3d', pink='#ff2e93', yellow='#ffd23a', cyan='#19e3ff', purple='#6a2cb0', trash='#2f6b3f').items()}
M['screen'] = toon('screen', hexc('#19e3ff'), emit=2.2)
M['bulb'] = toon('bulb', hexc('#ffb14a'), emit=12.0)


def brick_color(nt):
    N, L = nt.nodes.new, nt.links.new
    tc = N('ShaderNodeTexCoord'); mp = N('ShaderNodeMapping'); L(tc.outputs['Object'], mp.inputs[0])
    br = N('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = hexc('#7a3326'); br.inputs['Color2'].default_value = hexc('#5c2a22')
    br.inputs['Mortar'].default_value = hexc('#3a3436'); br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = .012; br.inputs['Brick Width'].default_value = .24; br.inputs['Row Height'].default_value = .085
    br.offset_frequency = 2; br.squash_frequency = 2
    sep = N('ShaderNodeSeparateXYZ'); L(mp.outputs[0], sep.inputs[0])
    comb = N('ShaderNodeCombineXYZ'); L(sep.outputs['X'], comb.inputs['X']); L(sep.outputs['Z'], comb.inputs['Y'])   # wall plane: X across, Z up
    L(comb.outputs[0], br.inputs['Vector'])
    noise = N('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.6; L(comb.outputs[0], noise.inputs['Vector'])
    grime = N('ShaderNodeMix'); grime.data_type = 'RGBA'; grime.blend_type = 'MULTIPLY'
    mr = N('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .35; mr.inputs['From Max'].default_value = .7; mr.inputs['To Min'].default_value = 0; mr.inputs['To Max'].default_value = .55
    L(noise.outputs['Fac'], mr.inputs['Value']); L(mr.outputs[0], grime.inputs['Factor'])
    L(br.outputs['Color'], grime.inputs[6]); grime.inputs[7].default_value = hexc('#2a2026')
    return grime.outputs[2]


M['brick'] = toon('brick', brick_color)

# ---------------------------------------------------------------- the set
GROUND = box('ground', (0, 1.5, -.05), (14, 12, .1), M['asphalt'], ink=0)
for i in range(7):                                             # painted parking lines / cracks
    box('line%d' % i, (-3 + i * 1.6, -1.6 + (i % 2) * .2, .002), (.08, 1.4, .004), M['yellow'] if i % 3 else M['white'], rot=(0, 0, .15), ink=0)
WALL_Y = 1.25
box('wall', (0, WALL_Y + .2, 2.2), (12, .4, 4.4), M['brick'], ink=0)
box('wallcap', (0, WALL_Y + .17, 4.42), (12, .5, .1), M['concrete'], ink=.015)
box('sidewalk', (0, WALL_Y - .3, .05), (12, .6, .1), M['concrete'], ink=.012)

# graffiti: a big pink PYRE piece with an offset black outline + yellow fill, tags around it
for off, mat, dz in ((.045, M['black'], -.004), (.02, M['pink'], 0.0)):
    text('PYRE', (-.25, WALL_Y - .01 + dz, 2.55), 1.55, mat, extrude=.006, offset=off, shear=.18, name='pyre_bg')
text('PYRE', (-.25, WALL_Y - .025, 2.55), 1.55, M['yellow'], extrude=.006, shear=.18, name='pyre_fg')
text('IGNITE', (2.15, WALL_Y - .01, 1.55), .42, M['cyan'], rot=(math.pi / 2, 0, .0), extrude=.004, offset=.012, shear=.3)
text('Y2K', (-2.35, WALL_Y - .01, 1.15), .6, M['lime'], extrude=.004, offset=.015, shear=-.2)
text('sk8 or die', (1.6, WALL_Y - .01, 3.4), .26, M['white'], extrude=.003, shear=.35)
for i, (cell, x, z, s) in enumerate((('p_sticker1', -1.3, 1.6, .22), ('p_sticker2', -1.05, 1.42, .2), ('p_skull', 1.15, 1.2, .22), ('p_bolt', .95, 2.0, .2),
                                     ('p_x', -2.8, 2.2, .24), ('p_star', 2.9, 2.5, .26), ('p_sticker3', .55, 1.15, .18), ('p_heart', -.85, 1.95, .18))):
    cell_plane('wst%d' % i, cell, (x, WALL_Y - .004, z), s, s, (0, RNG.uniform(-.2, .2), 0))
cell_plane('poster', 'p_crash', (2.45, WALL_Y - .004, 2.45), .9, .9, (0, .04, 0), ink=.01)

# the funbox he sits on: plywood box, painted top, steel coping on the front edge, stickers + tags on the face
BOX_H, BOX_FRONT = 1.12, -.32
box('funbox', (0, BOX_FRONT + .55, BOX_H / 2), (2.2, 1.1, BOX_H), M['ply'], ink=.016)
box('funtop', (0, BOX_FRONT + .55, BOX_H + .012), (2.22, 1.12, .024), M['plyDark'], ink=.012)
cyl('coping', (0, BOX_FRONT, BOX_H + .02), .03, 2.24, M['coping'], rot=(0, math.pi / 2, 0), ink=.008)
text('FIRE', (-.55, BOX_FRONT - .006, .62), .36, M['black'], extrude=.004, offset=.012, shear=.25)
text('FIRE', (-.55, BOX_FRONT - .012, .62), .36, M['pink'], extrude=.003, shear=.25)
for i, (cell, x, z, s) in enumerate((('p_mushroom', .45, .75, .2), ('p_sticker1', .72, .45, .16), ('p_bolt', -.95, .35, .15), ('p_sticker2', .2, .3, .14), ('p_x', .95, .85, .13))):
    cell_plane('bst%d' % i, cell, (x, BOX_FRONT - .004, z), s, s, (0, RNG.uniform(-.3, .3), 0))

# props: traffic cone, milk crates, CRT TV with a glowing screen, decks leaning on the wall, boombox, trash can
cyl('cone', (1.25, -.7, .3), .17, .6, M['cone'], r2=.025, ink=.01)
cyl('coneband', (1.25, -.7, .34), .105, .09, M['white'], r2=.085, ink=.0)
box('conebase', (1.25, -.7, .02), (.42, .42, .04), M['cone'], ink=.01)
for i, (x, y, z, r, m) in enumerate(((-1.55, -.35, .16, .1, 'crate'), (-1.55, -.35, .5, -.08, 'crateB'), (-2.0, -.1, .16, .3, 'crateB'))):
    o = box('crate%d' % i, (x, y, z), (.38, .38, .32), M[m], rot=(0, 0, r), ink=.012)
box('tv', (-1.55, -.35, .9), (.5, .44, .42), M['tv'], rot=(0, 0, .25), ink=.014)
scr = cell_plane('tvscreen', 'p_sticker1', (0, 0, 0), .34, .28, (0, 0, 0), ink=.0, emit=2.0)
scr.parent = bpy.data.objects['tv']; scr.location = (0, -.225, .02); scr.scale = (1 / .5, 1 / .44, 1 / .42)
scr.matrix_parent_inverse = Matrix.Identity(4)
scr.location = (0, -.512, .0); scr.scale = (.34 / .5 * 1, 1, .28 / .42)
cyl('ant1', (-1.5, -.3, 1.25), .006, .45, M['black'], rot=(.4, .3, 0), ink=.004)
cyl('ant2', (-1.62, -.3, 1.25), .006, .45, M['black'], rot=(.3, -.4, 0), ink=.004)
box('boombox', (1.95, .4, .18), (.62, .2, .34), M['tvDark'], rot=(0, 0, -.2), ink=.012)
for k in (-1, 1):
    cyl('spk%d' % k, (1.95 + k * .19 * math.cos(.2), .4 - .105 + k * .19 * math.sin(.2) * -1, .17), .095, .03, M['lime'], rot=(math.pi / 2, 0, -.2), ink=.006)
cyl('trash', (2.85, .65, .5), .3, 1.0, M['trash'], ink=.014)

# ---------------------------------------------------------------- the deck (Pyre's custom board): concave, kicktails, graffiti on the underside
def build_deck():
    L_, W = .8, .21
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    nu, nv = 6, 28
    x0, y0, cw, ch = CELLS['deck']
    gx0, gy0, gw, gh = CELLS['grip']

    def P(i, j, top):
        u, v = i / nu - .5, j / nv - .5                  # across, along
        t = abs(v) * 2
        half = W / 2 * (1 - max(0.0, (t - .78) / .22) ** 2 * .55)   # rounded nose and tail
        z = max(0.0, t - .74) ** 1.6 * .38 + (u * 2) ** 2 * .008 + (0.0 if top else -.013)
        return Vector((u * 2 * half, v * L_, z))
    for top in (True, False):
        g = [[bm.verts.new(P(i, j, top)) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                q = (g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i]) if top else (g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1])
                f = bm.faces.new(q)
                f.material_index = 0 if top else 1
                for l in f.loops:
                    jj, ii = [(a, b) for a in (j, j + 1) for b in (i, i + 1) if g[a][b] is l.vert][0]
                    if top: l[uv].uv = ((gx0 + 2 + (gw - 4) * ii / nu) / S, 1 - (gy0 + 2 + (gh - 4) * jj / nv) / S)
                    else: l[uv].uv = ((x0 + 2 + (cw - 4) * (1 - ii / nu)) / S, 1 - (y0 + 2 + (ch - 4) * (1 - jj / nv)) / S)
    # edge walls between top and bottom
    o = obj_from_bm('deck', bm, [STICK, STICK])
    outline(o, .008)
    parts = [o]
    for e in (-1, 1):
        parts.append(box('truck%d' % e, (0, e * .27, -.035), (.16, .04, .035), M['coping'], ink=.006))
        for k in (-1, 1):
            parts.append(cyl('wheel%d%d' % (e, k), (k * .09, e * .27, -.06), .03, .035, M['yellow'], rot=(0, math.pi / 2, 0), ink=.006))
    root = bpy.data.objects.new('DECK', None); sc.collection.objects.link(root)
    for p in parts: p.parent = root
    return root


DECK = build_deck()

# ---------------------------------------------------------------- Pyre, posed sitting on the box edge
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'hero', 'pyre.glb'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in [o for o in bpy.data.objects if o.parent is arm and o.type == 'MESH']:
    flame = 'Flame' in o.name
    o.data.materials.clear()
    o.data.materials.append(toon('pyre_flame' if flame else 'pyre', image=ATL, emit=2.6 if flame else 0.0))
    outline(o, .009 if flame else .011)
P = arm.pose.bones


def rot(b, axis, deg):
    pb = P[b]
    h = arm.matrix_world @ pb.head
    R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h)
    pb.matrix = R @ pb.matrix
    bpy.context.view_layer.update()


# legs: thighs forward over the edge, one shin dangling, one tucked back against the box
rot('thigh_l', 'X', -84); rot('thigh_l', 'Z', 14)
rot('thigh_r', 'X', -82); rot('thigh_r', 'Z', -16)
rot('calf_l', 'X', 70); rot('calf_r', 'X', 102)
rot('foot_l', 'X', 18); rot('foot_r', 'X', -10)
# torso leans in, head tips down toward the low camera, a little attitude
rot('spine_01', 'X', 10); rot('spine_02', 'X', 8); rot('spine_03', 'X', 4); rot('spine_03', 'Z', -6)
rot('neck_01', 'X', 10); rot('Head', 'X', 6); rot('Head', 'Z', -10); rot('Head', 'Y', 6)
# left forearm resting across the left knee, right hand on the nose of the standing deck
rot('upperarm_l', 'Y', 80); rot('upperarm_l', 'X', -35); rot('lowerarm_l', 'X', -50); rot('lowerarm_l', 'Z', 18); rot('hand_l', 'X', 45)
rot('upperarm_r', 'Y', 12); rot('upperarm_r', 'X', -14); rot('lowerarm_r', 'Y', 34); rot('hand_r', 'Y', 10)

arm.location = (0.0, BOX_FRONT + .37, BOX_H - .855)
bpy.context.view_layer.update()
DECK.location = (-.66, BOX_FRONT + .2, BOX_H + .43)
DECK.rotation_euler = (math.radians(-90 + 6), 0, math.radians(-12))
DECK.rotation_euler = Euler((math.radians(96), math.radians(-14), math.radians(-14 + 180)))

# ---------------------------------------------------------------- lights: two sodium street lamps, a hot flash from the camera, a flame glow
def light(name, kind, loc, energy, color, size=.05, rot=None, spot=None, shadow=True):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color[:3]
    if kind in ('POINT', 'SPOT'): ld.shadow_soft_size = size
    if kind == 'AREA': ld.size = size
    if spot: ld.spot_size, ld.spot_blend = spot
    ld.use_shadow = shadow
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o); o.location = loc
    if rot: o.rotation_euler = rot
    return o


SODIUM = (1.0, .52, .16)
# lamp post (left, in frame) + its head
cyl('pole', (-2.55, .55, 1.9), .06, 3.8, M['pole'], ink=.012)
box('arm', (-2.15, .55, 3.78), (.85, .08, .08), M['pole'], ink=.01)
box('head', (-1.75, .55, 3.72), (.42, .22, .12), M['pole'], ink=.01)
box('bulb', (-1.75, .55, 3.655), (.34, .16, .02), M['bulb'], ink=0)
light('sodiumL', 'SPOT', (-1.75, .4, 3.6), 2600, SODIUM, .12, rot=(math.radians(18), math.radians(-14), 0), spot=(math.radians(95), .35))
light('sodiumR', 'SPOT', (2.8, -1.2, 3.9), 2400, SODIUM, .15, rot=(math.radians(28), math.radians(32), 0), spot=(math.radians(85), .4))
light('sodiumFill', 'AREA', (0, -3.5, 4.5), 250, (1.0, .6, .3), 3.0, rot=(math.radians(40), 0, 0))
light('rim', 'SPOT', (-.6, WALL_Y - .1, 3.2), 900, (1.0, .45, .12), .05, rot=(math.radians(-40), 0, math.radians(10)), spot=(math.radians(50), .3))
light('flameGlow', 'POINT', (0, BOX_FRONT + .55, BOX_H + 1.35), 40, (1.0, .45, .1), .1, shadow=False)

# camera: low, a little to the side, looking up at him; the flash sits right on it
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 30
cam.location = Vector((.6, -2.75, .55))
tgt = Vector((-.12, BOX_FRONT + .3, 1.62))
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.rotation_euler.y += math.radians(-4)                     # a slight dutch tilt
light('flash', 'POINT', cam.location + Vector((.06, .05, .12)), 700, (1, .97, .94), .015)

# ---------------------------------------------------------------- render
w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = hexc('#0d1030'); w.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
sc.render.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = SAMPLES
try: sc.eevee.use_shadows = True
except Exception: pass
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.render.resolution_x, sc.render.resolution_y = 1080, 1350
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- comic print pass (numpy): halftone dots in the shadows, misregistered colour, grain, vignette
import numpy as np
im = bpy.data.images.load(OUT)
W, H = im.size
px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px)
img = px.reshape(H, W, 4)[:, :, :3].copy()
lum = img @ np.array([.2126, .7152, .0722], dtype=np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
cell = 7.0
u, v = (xx + yy) / math.sqrt(2), (xx - yy) / math.sqrt(2)
du, dv = (u % cell) - cell / 2, (v % cell) - cell / 2
d = np.sqrt(du * du + dv * dv)
shade = np.clip((.42 - lum) / .42, 0, 1)                          # only the darker tones get dots
dots = d < shade * cell * .62
img[dots] *= .62
img[:, :, 0] = np.roll(img[:, :, 0], 2, axis=1)                    # red plate slightly off register
img[:, :, 2] = np.roll(img[:, :, 2], -2, axis=1)
rng = np.random.default_rng(5)
img += (rng.random((H, W, 1), dtype=np.float32) - .5) * .035
cx, cy = W / 2, H / 2
vig = 1 - .35 * (((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) ** 1.4
img *= vig[:, :, None]
out = np.concatenate([np.clip(img, 0, 1), np.ones((H, W, 1), np.float32)], axis=2)
im.pixels.foreach_set(out.ravel()); im.filepath_raw = OUT; im.file_format = 'PNG'; im.save()
print('PHOTO', OUT)
