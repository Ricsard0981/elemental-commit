# PYRE: builds the faceless fire-punk skater from scratch and exports assets/hero/pyre.glb.
#   blender --background --python tools/blender/build_pyre.py [-- out.glb]
# Pure-python modelling (bmesh), no manual steps. One shared atlas (tools/blender/atlas.png + atlas.json from atlas_gen.mjs);
# every part gets its UVs from an atlas cell (flat swatch or decal). The armature is the game's own rig (same bone names, same T-pose),
# so every clip in assets/hero/anims.glb plays on him. Weights are computed per part from distance to the allowed bones.
# Blender coordinates: Z up, the character faces -Y, his left is +X.
import bpy, bmesh, math, json, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, 'assets', 'hero', 'pyre.glb')
ATLAS = json.load(open(os.path.join(HERE, 'atlas.json')))
S, CELLS = ATLAS['size'], ATLAS['cells']

# ---------------------------------------------------------------- scene + the game's rig
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'hero', 'body_m.glb'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o is not arm:
        bpy.data.objects.remove(o, do_unlink=True)
BONES = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
BONE_NAMES = list(BONES.keys())

# ---------------------------------------------------------------- builder
bm = bmesh.new()
UVL = bm.loops.layers.uv.new('UVMap')
DL = bm.verts.layers.deform.new()
PARTS = []          # (verts, allowed bones, sigma)
MAIN, FLAME = 0, 1


def cuv(name):
    x, y, w, h = CELLS[name]
    return Vector(((x + w / 2) / S, 1 - (y + h / 2) / S))


def finish(verts, cell, bones, sigma=0.06, mat=MAIN, smooth=True, proj=None):
    """proj: (u, v) = proj(co) in 0..1 maps the part across the whole atlas cell (a printed pattern) instead of one flat colour"""
    vs = set(verts)
    faces = [f for f in {f for v in verts for f in v.link_faces} if all(v in vs for v in f.verts)]
    for f in faces:
        f.material_index = mat
        f.smooth = smooth
        if cell and proj:
            x0, y0, w, h = CELLS[cell]
            for l in f.loops:
                u, v = proj(l.vert.co)
                u, v = min(1, max(0, u)), min(1, max(0, v))
                l[UVL].uv = ((x0 + 2 + (w - 4) * u) / S, 1 - (y0 + 2 + (h - 4) * (1 - v)) / S)
        elif cell:
            uv = cuv(cell)
            for l in f.loops:
                l[UVL].uv = uv
    PARTS.append((list(vs), bones, sigma))
    return faces


def mtx(loc=(0, 0, 0), rot=(0, 0, 0), sc=(1, 1, 1)):
    return Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1))


def mrot(rot, s):                       # mirror an euler across the X plane
    return (rot[0], rot[1] * s, rot[2] * s)


def cube(loc, sc, rot=(0, 0, 0)):
    return bmesh.ops.create_cube(bm, size=1.0, matrix=mtx(loc, rot, sc))['verts']


def sphere(loc, sc, rot=(0, 0, 0), u=12, v=8):
    return bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0, matrix=mtx(loc, rot, sc))['verts']


def cone(loc, r1, r2, depth, sc=(1, 1, 1), rot=(0, 0, 0), seg=8):
    return bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=mtx(loc, rot, sc))['verts']


def ring(c, u, v, ru, rv, n, amp=0.0, ph=0.0):
    """an ellipse; amp > 0 ripples the radius (cloth folds)"""
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        f = 1 + amp * (math.sin(3 * a + ph) + .5 * math.sin(5 * a + 2 * ph)) / 1.5
        out.append(c + u * (ru * f * math.cos(a)) + v * (rv * f * math.sin(a)))
    return out


def sring(c, u, v, ru, rv, n, p=4.0):
    """a superellipse (p=2 ellipse, p>2 squarer): flat-bottomed soles"""
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        ca, sa = math.cos(a), math.sin(a)
        out.append(c + u * (ru * math.copysign(abs(ca) ** (2 / p), ca)) + v * (rv * math.copysign(abs(sa) ** (2 / p), sa)))
    return out


def loft(rings, wrap=False, cap0=True, cap1=True):
    n = len(rings[0])
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    last = len(rings) if wrap else len(rings) - 1
    for i in range(last):
        a, b = vr[i], vr[(i + 1) % len(rings)]
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if not wrap:
        if cap0: bm.faces.new(vr[0][::-1])
        if cap1: bm.faces.new(vr[-1])
    return [v for r in vr for v in r]


def axis_rings(axis, specs, n=12, s=1):
    """specs: (t, c1, c2, r1, r2). z: centre (c1, c2, t), r1 on x, r2 on y.  x: centre (s*t, c1, c2), r1 on y, r2 on z.  y: centre (c1, t, c2), r1 on x, r2 on z."""
    out = []
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for sp in specs:
        t, c1, c2, r1, r2 = sp[:5]
        amp, ph = (sp[5] if len(sp) > 5 else 0.0), (sp[6] if len(sp) > 6 else t * 37.0)
        if axis == 'z':
            out.append(ring(Vector((c1, c2, t)), X, Y, r1, r2, n, amp, ph))
        elif axis == 'x':
            out.append(ring(Vector((s * t, c1, c2)), Y, Z, r1, r2, n, amp, ph) if s > 0 else ring(Vector((s * t, c1, c2)), Z, Y, r2, r1, n, amp, ph))
        else:
            out.append(ring(Vector((c1, t, c2)), X, Z, r1, r2, n, amp, ph))
    return out


def tube(axis, specs, n=12, s=1, caps=True):
    return loft(axis_rings(axis, specs, n, s), cap0=caps, cap1=caps)


def lerp_spec(specs, t):
    if t <= specs[0][0]: return specs[0][1:5]
    for a, b in zip(specs, specs[1:]):
        if t <= b[0]:
            k = (t - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(1, 5))
    return specs[-1][1:5]


def decal(cell, pts, uvrect=None, quad=True):
    """pts: grid [j][i] of Vector, j = rows bottom->top, i = columns left->right in texture space. Winding is chosen by `flip` on the caller via order."""
    x0, y0, w, h = CELLS[cell]
    nj, ni = len(pts), len(pts[0])
    vs = [[bm.verts.new(p) for p in row] for row in pts]
    for j in range(nj - 1):
        for i in range(ni - 1):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for l in f.loops:
                vi = [(jj, ii) for jj in (j, j + 1) for ii in (i, i + 1) if vs[jj][ii] is l.vert][0]
                u = (x0 + 0.5 + (w - 1) * vi[1] / (ni - 1)) / S
                v = 1 - (y0 + 0.5 + (h - 1) * (1 - vi[0] / (nj - 1))) / S
                l[UVL].uv = (u, v)
            f.smooth = True
    return [v for r in vs for v in r]


def finish_decal(verts, bones, sigma=0.06, mat=MAIN, flip=False):
    vs = set(verts)
    faces = [f for f in {f for v in verts for f in v.link_faces} if all(v in vs for v in f.verts)]
    if flip: bmesh.ops.reverse_faces(bm, faces=faces)
    for f in faces: f.material_index = mat
    PARTS.append((list(vs), bones, sigma))


def torso_decal(cell, prof, zc, xc, w, h, front=True, inset=0.004, rot=0.0, bones=None, nu=4, nv=4):
    """a patch pasted on an elliptical torso: prof(z) -> (c1, c2, r1, r2)"""
    pts = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            a, b = (i / nu - .5) * w, (j / nv - .5) * h
            a, b = a * math.cos(rot) - b * math.sin(rot), a * math.sin(rot) + b * math.cos(rot)
            x = xc + a if front else xc - a
            z = zc + b
            c1, c2, r1, r2 = prof(z)
            q = max(0.0, 1 - ((x - c1) / r1) ** 2)
            y = c2 - r2 * math.sqrt(q) - inset if front else c2 + r2 * math.sqrt(q) + inset
            row.append(Vector((x, y, z)))
        pts.append(row)
    vs = decal(cell, pts)
    finish_decal(vs, bones or ['spine_03', 'spine_02'], 0.08, flip=not front)


def ellipsoid_decal(cell, centre, radii, p0, p1, width, side=1, inset=0.004, bones=('Head',), nu=2, nv=3, mat=MAIN):
    """a strip / sticker projected onto an ellipsoid: p0..p1 is the centre line (world), width across it; the strip is projected radially"""
    c, r = Vector(centre), Vector(radii)
    d = (Vector(p1) - Vector(p0))
    L = d.length
    dn = d / L
    nrm = (Vector(p0) + d / 2 - c)
    nrm = Vector((nrm.x / r.x ** 2, nrm.y / r.y ** 2, nrm.z / r.z ** 2)).normalized()
    wv = dn.cross(nrm).normalized()
    pts = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            p = Vector(p0) + dn * (L * j / nv) + wv * (width * (i / nu - .5))
            q = Vector(((p.x - c.x) / r.x, (p.y - c.y) / r.y, (p.z - c.z) / r.z)).normalized()
            pp = Vector((c.x + q.x * r.x, c.y + q.y * r.y, c.z + q.z * r.z))
            n = Vector((q.x / r.x, q.y / r.y, q.z / r.z)).normalized()
            row.append(pp + n * inset)
        pts.append(row)
    # decal() wants rows bottom->top (v) and columns left->right (u): j runs along the centre line (v), i across it (u)
    vs = decal(cell, pts)
    # winding: make the normal face outward
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        cen = f.calc_center_median()
        o = Vector(((cen.x - c.x) / r.x ** 2, (cen.y - c.y) / r.y ** 2, (cen.z - c.z) / r.z ** 2))
        if f.normal.dot(o) < 0:
            bmesh.ops.reverse_faces(bm, faces=[f])
    for f in faces: f.material_index = mat
    PARTS.append((list(vs), list(bones), 0.05))


def flat_decal(cell, loc, w, h, nx, rot=0.0, bones=('Head',), mat=MAIN):
    """a flat patch whose normal is +X (nx>0) or -X"""
    pts = []
    for j in range(2):
        row = []
        for i in range(2):
            a, b = (i - .5) * w, (j - .5) * h
            a, b = a * math.cos(rot) - b * math.sin(rot), a * math.sin(rot) + b * math.cos(rot)
            row.append(Vector((loc[0], loc[1] + a * nx, loc[2] + b)))     # +X side: u runs along +Y; -X side: along -Y
        pts.append(row)
    vs = decal(cell, pts)
    finish_decal(vs, list(bones), 0.05, mat=mat, flip=False)


# ================================================================ PYRE
# Matched to assets/concept/pyre (sheet + pencil turnaround): round skate helmet with vents over a blank peach oval,
# one tall torch flame from the crown, brown hoodie (hood bunched round the neck, draped on the back, rust ribbed hem), a sleeveless
# denim trucker vest (pointed collar, V-flap chest pockets, slanted hand pockets, spiked + frayed shoulders, sewn patches and pins,
# CRASH mushroom painted on the back), bare arms with stacked black bracelets, studded belt, chain on the left hip, relaxed olive
# cargos stacking at the ankle, rust high-tops with flame prints, white toe caps and soles.
X3, Y3, Z3 = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
HEAD_SCALE, HEAD_PIVOT = 1.2, Vector((0, .02, 1.585))
FACE_C, FACE_R = (0.0, 0.0, 1.70), (0.083, 0.088, 0.114)
HC, HR = (0.0, 0.018, 1.737), (0.113, 0.123, 0.113)               # helmet shell

HOODIE = [(.95, 0, .035, .19, .14), (1.05, 0, .03, .182, .132), (1.17, 0, .02, .176, .126), (1.32, 0, .0, .222, .143), (1.43, 0, .008, .234, .148), (1.5, 0, .03, .19, .118), (1.56, 0, .04, .1, .085)]
VEST = [(1.0, 0, .02, .212, .158, .01), (1.06, 0, .018, .203, .15, .01), (1.14, 0, .016, .194, .14, .008), (1.23, 0, .008, .214, .15, .006), (1.31, 0, .0, .24, .162, .004),
        (1.39, 0, .002, .245, .162), (1.45, 0, .01, .247, .158), (1.5, 0, .028, .22, .136), (1.525, 0, .036, .19, .12)]
TORSO_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']


def vest_prof(z): return lerp_spec(VEST, z)


def vest_front_y(x, z, out=0.0):
    c1, c2, r1, r2 = vest_prof(z)
    return c2 - r2 * math.sqrt(max(0.0, 1 - ((x - c1) / r1) ** 2)) - out


def front_slab(cell, pts, s=1, out=.004, th=.008, bones=None, smooth=False):
    """a thin extruded shape lying on the vest front (collar, pocket flaps). pts: (x, z) counter-clockwise seen from the front, left side; s mirrors"""
    pts = [(s * x, z) for x, z in pts]
    if s < 0: pts = pts[::-1]
    f = [bm.verts.new(Vector((x, vest_front_y(x, z, out + th), z))) for x, z in pts]
    b = [bm.verts.new(Vector((x, vest_front_y(x, z, out), z))) for x, z in pts]
    bm.faces.new(f)
    bm.faces.new(b[::-1])
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((b[i], b[j], f[j], f[i]))
    finish(f + b, cell, bones or TORSO_BONES, 0.07, smooth=smooth)


def pin(x, z, r, col, out=.004):
    finish(cone((x, vest_front_y(x, z, out + .003), z), r, r, .007, rot=(math.pi / 2, 0, 0), seg=6), col, TORSO_BONES, 0.07, smooth=False)


# ---------------------------------------------------------------- hoodie
finish(tube('z', HOODIE, n=14), 'hoodie', TORSO_BONES, 0.07)
finish(tube('z', [(.962, 0, .033, .205, .152, .02), (1.0, 0, .028, .2, .148, .02)], n=16), 'band', TORSO_BONES, 0.07)              # rust ribbed hem
cowl = tube('z', [(1.465, 0, .03, .13, .114, .07), (1.505, 0, .036, .122, .106, .09), (1.54, 0, .046, .1, .09, .06)], n=14, caps=False)
vfront = [f for f in {f for v in cowl for f in v.link_faces} if f.calc_center_median().y < -.02 and abs(f.calc_center_median().x) < .05 + (1.54 - f.calc_center_median().z) * .3]
bmesh.ops.delete(bm, geom=vfront, context='FACES_ONLY')                                       # the V where the hood crosses at the front
finish([v for v in cowl if v.is_valid], 'hoodie', ['spine_03', 'neck_01'], 0.06)
hood = sphere((0, .15, 1.45), (.175, .05, .1), u=12, v=6)                                    # hood lying flat on the back, a fold down the middle
for v in hood:
    v.co.y += .012 * math.cos(v.co.x / .175 * math.pi * 1.5) - .02 * max(0.0, (1.47 - v.co.z) / .1)
finish(hood, 'hoodie', ['spine_03', 'spine_02'], 0.07)
finish(sphere((0, .1, 1.525), (.115, .065, .05), u=10, v=6), 'hoodie', ['spine_03', 'neck_01'], 0.06)
for s in (1, -1):                                                                              # long drawstrings with brass tips
    finish(tube('z', [(1.505, s * .03, -.112, .005, .005), (1.42, s * .036, -.135, .005, .005), (1.33, s * .034, -.142, .005, .005)], n=5), 'tape', ['spine_03', 'spine_02'], 0.05)
    finish(cube((s * .034, -.143, 1.318), (.011, .011, .026)), 'brass', ['spine_02'], 0.05, smooth=False)

# ---------------------------------------------------------------- denim trucker vest
vs = tube('z', VEST, n=20, caps=False)
slit = [f for f in {f for v in vs for f in v.link_faces}
        if f.calc_center_median().y < 0.0 and abs(f.calc_center_median().x) < .058 + max(0.0, f.calc_center_median().z - 1.28) * .4]
bmesh.ops.delete(bm, geom=slit, context='FACES_ONLY')
finish([v for v in vs if v.is_valid], 'denim', TORSO_BONES, 0.07)
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    # pointed collar lying open on the chest + the band behind the neck
    front_slab('denim', [(.07, 1.515), (.075, 1.43), (.12, 1.4), (.185, 1.475), (.16, 1.505)], s, out=.004, th=.01)
    # chest pocket: body, V flap, brass button
    px = .135
    front_slab('denim', [(px - .056, 1.4), (px - .056, 1.27), (px + .056, 1.27), (px + .056, 1.4)], s, out=.002, th=.005)
    front_slab('denimDark', [(px - .06, 1.41), (px - .06, 1.375), (px, 1.348), (px + .06, 1.375), (px + .06, 1.41)], s, out=.007, th=.007)
    pin(s * px, 1.362, .009, 'brass', out=.014)
    # slanted hand-warmer welts and seams, waistband and its side buttons
    front_slab('denimDark', [(.1, 1.2), (.112, 1.205), (.165, 1.105), (.153, 1.1)], s, out=.003, th=.004)
    front_slab('denimDark', [(.16, 1.26), (.166, 1.26), (.166, 1.03), (.16, 1.03)], s, out=.002, th=.002)
    front_slab('denimDark', [(.075, 1.045), (.075, 1.04), (.215, 1.04), (.215, 1.045)][::-1], s, out=.002, th=.002)
    pin(s * .19, 1.02, .008, 'brass')
    # placket buttons following the opening
    for z in (1.42, 1.32, 1.22, 1.12, 1.03):
        x = .058 + max(0.0, z - 1.28) * .4 + .014
        pin(s * x, z, .008, 'brass')
    # spikes on the shoulder seam, pointing up and out + frayed armhole threads
    for k, (dx, dz, ang) in enumerate(((.17, 1.515, .35), (.205, 1.51, .6), (.24, 1.49, .85))):
        finish(cone((s * dx, .03, dz), .014, .0, .055, rot=(0, s * ang, 0), seg=5), 'silver', ['clavicle' + sf, 'spine_03'], 0.06, smooth=False)
    for k in range(10):
        a = -1.9 + k * .4
        ln = .02 + (k % 3) * .012
        finish(cone((s * .262, .02 + math.sin(a) * .088, 1.39 + math.cos(a) * .1), .006, 0, ln, rot=(0, s * (1.4 + (k % 2) * .3), 0), seg=3), 'tape', ['clavicle' + sf, 'spine_03'], 0.06, smooth=False)
# sewn patches (drawn on denim, so only the patch shape shows) + pins, placed like the sheet
torso_decal('p_purple', vest_prof, 1.445, -.15, .055, .055, inset=.006, rot=.15)
torso_decal('p_mush2', vest_prof, 1.31, -.135, .06, .06, inset=.009)
torso_decal('p_heartp', vest_prof, 1.31, .135, .055, .055, inset=.009)
torso_decal('p_redrect', vest_prof, 1.2, .12, .06, .06, inset=.006)
torso_decal('p_oval', vest_prof, 1.2, .19, .05, .05, inset=.006)
torso_decal('p_yrect', vest_prof, 1.09, .17, .055, .055, inset=.006)
pin(-.105, 1.44, .012, 'yellow'); pin(.105, 1.45, .011, 'orange'); pin(.17, 1.445, .013, 'green'); pin(-.2, 1.23, .01, 'pink')
torso_decal('p_crash', vest_prof, 1.235, 0.0, .3, .3, front=False, inset=.005)                    # painted on the back

# ---------------------------------------------------------------- neck + head group
finish(tube('z', [(1.47, 0, .035, .052, .056), (1.64, 0, .02, .05, .052)], n=8), 'skin', ['spine_03', 'neck_01', 'Head'], 0.05)
head_from = len(PARTS)
fv = sphere(FACE_C, FACE_R, u=14, v=9)                                                   # blank oval face, tapering to the chin
for v in fv:
    t = max(0.0, (FACE_C[2] - v.co.z) / FACE_R[2])
    v.co.x *= 1 - .25 * t
    v.co.y = FACE_C[1] + (v.co.y - FACE_C[1]) * (1 - .12 * t)
finish(fv, 'face', ['Head'], 0.02)


def helmet_cut(v, c, r, lower=0.0):
    d = Vector(((v.co.x - c[0]) / r[0], (v.co.y - c[1]) / r[1], (v.co.z - c[2]) / r[2]))
    f = max(0.0, min(1.0, (-d.y - .15) / .5))
    f = f * f * (3 - 2 * f)
    thr = c[2] + (-.1 + (.01 + .1) * f) * (r[2] / .113) - lower
    if v.co.z < thr: v.co.z = thr


hv = sphere(HC, HR, u=16, v=10)                                                           # round shell: straight brow, sides down over the ears
for v in hv: helmet_cut(v, HC, HR)
finish(hv, 'helmet', ['Head'], 0.02)
LR = (HR[0] - .007, HR[1] - .007, HR[2] - .007)
lv = sphere(HC, LR, u=16, v=8)                                                           # black liner peeking under the rim
for v in lv: helmet_cut(v, HC, LR, lower=.012)
finish(lv, 'lining', ['Head'], 0.02)


def on_helmet(d, out=0.0):
    d = Vector(d).normalized()
    return Vector((HC[0] + d.x * (HR[0] + out), HC[1] + d.y * (HR[1] + out), HC[2] + d.z * (HR[2] + out)))


for d in ((.45, -.72, .52), (-.45, -.72, .52), (.32, -.2, .92), (-.32, -.2, .92), (.3, .35, .88), (-.3, .35, .88), (.42, .78, .45), (-.42, .78, .45)):
    finish(cone(on_helmet(d, -.002), .014, .014, .008, rot=Vector(d).normalized().to_track_quat('Z', 'Y').to_euler(), seg=6), 'lining', ['Head'], 0.02, smooth=False)     # vents
ellipsoid_decal('p_sticker1', HC, HR, on_helmet((.93, -.05, .25)), on_helmet((.9, -.05, .43)), .05, inset=.003)


def lick(p0, d, L, r0, col, curl=(0.0, 0.0, 0.0), segs=3):
    """a pointed lick of flame from p0 along d, curling"""
    d = Vector(d).normalized()
    rings = []
    for i in range(segs + 1):
        t = i / segs
        c = Vector(p0) + d * (L * t) + Vector(curl) * (L * t * t)
        r = max(.002, r0 * (1 - t) ** .9)
        rings.append(ring(c, X3, Y3, r, r * .8, 5))
    finish(loft(rings), col, ['Head'], 0.02, mat=FLAME, smooth=False)


top = HC[2] + HR[2] - .02
flame_from = len(PARTS)
# the torch body: wide from the front, rising and tapering with a slight S-wave
FH = .33


def fw(t): return (.07 + .1 * t / .3) if t < .3 else .17 * ((1 - t) / .7) ** .8 + .004


def fc(t): return Vector((.012 * math.sin(t * math.pi * 2.2), .025 * t * t, top + FH * t))


finish(loft([ring(fc(t), X3, Y3, fw(t) * .5, fw(t) * .36, 8) for t in [i / 7 for i in range(8)]]), 'flame', ['Head'], 0.02, mat=FLAME, smooth=False)
for i, (t0, sx, sy, L, curl) in enumerate(((.42, -1, -.2, .13, (.0, 0, .3)), (.45, 1, .1, .14, (0, 0, .35)), (.6, -1, .2, .11, (.05, 0, .3)), (.63, 1, -.2, .12, (-.05, 0, .35)),
                                           (.74, -.5, .3, .1, (.05, .0, .3)), (.77, .5, .2, .09, (-.05, 0, .3)), (.5, .2, -1, .08, (0, 0, .3)), (.52, -.2, 1, .09, (0, 0, .3)))):
    lick(fc(t0), (sx * .8, sy * .5, 1.0), L, .028, 'flame', curl)
for sy in (-1, 1):                                                       # yellow cores sitting proud of the body, front and back
    core = []
    for i in range(5):
        t = i / 4
        tb = t * .62
        w = fw(tb) * (.62 - .2 * t)
        c = fc(tb) + Vector((0, sy * (fw(tb) * .36 - w * .12), .005))
        core.append(ring(c, X3, Y3, w * .5, w * .16, 6))
    finish(loft(core), 'yellow', ['Head'], 0.02, mat=FLAME, smooth=False)
for p, sc_ in (((-.085, .0, top + .3), .02), ((.09, .02, top + .36), .017), ((.035, -.01, top + .43), .014)):   # floating embers
    finish(cone(p, sc_ * .6, 0, sc_ * 2, seg=4, rot=(0, .4, .3)), 'flame', ['Head'], 0.02, mat=FLAME, smooth=False)
FP, FR = Vector((0, 0, top)), Matrix.Rotation(-.12, 3, 'X')
for v in {v for p in PARTS[flame_from:] for v in p[0]}:
    v.co = FP + FR @ (v.co - FP)
for v in {v for p in PARTS[head_from:] for v in p[0]}:
    v.co = HEAD_PIVOT + (v.co - HEAD_PIVOT) * HEAD_SCALE

# ---------------------------------------------------------------- arms: bare, muscular, stacked black bracelets
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    ab = ['clavicle' + sf, 'upperarm' + sf, 'lowerarm' + sf, 'hand' + sf]
    finish(tube('x', [(.15, .058, 1.46, .085, .08), (.215, .062, 1.47, .1, .098), (.27, .066, 1.462, .092, .088), (.33, .069, 1.452, .08, .082),
                      (.4, .074, 1.452, .084, .078), (.462, .074, 1.456, .062, .058), (.51, .073, 1.456, .072, .066), (.57, .071, 1.456, .066, .058),
                      (.65, .068, 1.456, .052, .046), (.71, .066, 1.456, .046, .041)], n=10, s=s), 'skin', ab, 0.05)
    for k in range(4):
        finish(tube('x', [(.63 + k * .018, .067, 1.456, .056, .051), (.642 + k * .018, .067, 1.456, .056, .051)], n=8, s=s), 'black' if k % 2 else 'lining', ab[2:], 0.03)
    for k in range(5):                                                                            # studs on one band
        a = k * math.pi * 2 / 5
        finish(cube((s * .675, .067 + math.cos(a) * .057, 1.456 + math.sin(a) * .052), (.009, .009, .009), rot=(a, 0, 0)), 'silver', ab[2:], 0.03, smooth=False)
    finish(sphere((s * .77, .066, 1.452), (.075, .062, .032), u=8, v=6), 'skin', ab[2:], 0.03)
    finish(sphere((s * .85, .062, 1.442), (.064, .056, .026), rot=(0, s * .35, 0), u=8, v=5), 'skin', ab[3:], 0.03)
    finish(sphere((s * .78, .01, 1.438), (.04, .034, .023), rot=(0, 0, s * .5), u=6, v=5), 'skin', ab[3:], 0.03)

# ---------------------------------------------------------------- pelvis, studded belt, chain on the left hip, back pockets
finish(tube('z', [(1.0, 0, .03, .19, .14), (.95, 0, .035, .202, .15), (.86, 0, .035, .2, .145)], n=18), 'cargo', ['pelvis', 'spine_01', 'thigh_l', 'thigh_r'], 0.07)
finish(tube('z', [(.928, 0, .034, .206, .154), (.962, 0, .033, .206, .154)], n=16), 'black', ['pelvis', 'spine_01'], 0.05)
finish(cube((0, -.19, .945), (.05, .02, .036)), 'silver', ['pelvis'], 0.03, smooth=False)
for k in range(14):
    a = k * 2 * math.pi / 14
    if abs(math.atan2(math.sin(a), -math.cos(a))) < .25: continue
    finish(cube((math.sin(a) * .21, .034 - math.cos(a) * .158, .945), (.013, .013, .013), rot=(0, 0, a)), 'silver', ['pelvis'], 0.04, smooth=False)


def link(p, ang_z, alt, R=.024, Rz=.03, r=.008):
    rows = []
    for a in range(6):
        aa = 2 * math.pi * a / 6
        c = Vector((math.cos(aa) * R, 0, math.sin(aa) * Rz))
        rows.append([Matrix.Rotation(ang_z + (math.pi / 2 if alt else 0), 3, 'Z') @ (c + Vector((math.cos(2 * math.pi * b / 4) * r * math.cos(aa), math.sin(2 * math.pi * b / 4) * r, math.cos(2 * math.pi * b / 4) * r * math.sin(aa)))) + p for b in range(4)])
    return loft(rows, wrap=True)


for i in range(11):                                                                       # front belt loop on his left -> loops low -> back pocket
    t = i / 10
    p = Vector((.15 + .1 * math.sin(math.pi * t), -.17 + .35 * t, .935 - .19 * math.sin(math.pi * t)))
    finish(link(p, math.atan2(.35, .1 * math.pi * math.cos(math.pi * t)), i % 2), 'silver', ['pelvis', 'thigh_l'], 0.05)
for s in (1, -1):
    finish(cube((s * .095, .19, .85), (.11, .016, .12)), 'cargo', ['pelvis', 'thigh_l' if s > 0 else 'thigh_r'], 0.06, smooth=False)
    finish(cube((s * .095, .2, .905), (.118, .022, .04)), 'cargoDark', ['pelvis'], 0.06, smooth=False)

# ---------------------------------------------------------------- legs: relaxed straight cargos stacking at the ankle + high-tops
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    lb = ['pelvis', 'thigh' + sf, 'calf' + sf, 'foot' + sf]
    X = lambda x: s * x
    LEG = [(.99, X(.112), .036, .118, .128, .0), (.85, X(.118), .036, .12, .13, .03), (.7, X(.122), .04, .122, .132, .04), (.55, X(.126), .046, .124, .134, .06),
           (.42, X(.13), .056, .132, .14, .07), (.32, X(.132), .064, .14, .148, .09), (.25, X(.132), .068, .15, .16, .12), (.2, X(.13), .066, .142, .152, .1),
           (.16, X(.128), .064, .148, .16, .12), (.125, X(.126), .066, .148, .162, .08), (.1, X(.126), .068, .142, .156, .04)]
    lv = tube('z', LEG, n=14)
    for v in lv:                                                                                  # the hem pools over the heel, rides up over the laces
        if v.co.z < .2:
            k = (.2 - v.co.z) / .1
            dy = v.co.y - .064
            v.co.z += -.045 * k * max(0.0, dy / .16) + .075 * k * max(0.0, -dy / .16)
    finish(lv, 'cargo', lb, 0.06)
    for z in (.57, .62):                                                                     # knee darts
        finish(tube('z', [(z, X(.126), .046, .126, .136), (z + .006, X(.126), .046, .126, .136)], n=14), 'cargoDark', lb[1:3], 0.05)
    px = X(.122 + .116)
    finish(cube((px, .045, .64), (.045, .15, .16)), 'cargo', lb[:3], 0.05, smooth=False)                                       # bellows pocket
    finish(cube((px + X(.004), .045, .73), (.054, .158, .048)), 'cargoDark', lb[:3], 0.05, smooth=False)                      # flap
    finish(sphere((px + X(.028), .045, .715), (.008, .01, .01), u=6, v=4), 'black', lb[:3], 0.05)
    # high-top: rust canvas with the flame print, white rubber toe cap, white sole with a dark pinstripe, six white laces
    cx = X(.114)
    sb = ['calf' + sf, 'foot' + sf, 'ball' + sf]
    flame = ('shoeflame', lambda co: ((co.y + .29) / .45, co.z / .25))
    finish(tube('y', [(.14, cx, .085, .066, .08), (.07, cx, .1, .078, .1), (-.03, cx, .09, .082, .085), (-.13, cx, .07, .084, .062), (-.2, cx, .058, .08, .048),
                      (-.25, cx, .05, .066, .036), (-.275, cx, .046, .045, .026)], n=12), 'shoeflame', sb, 0.05, proj=flame[1])
    finish(tube('z', [(.07, cx, .072, .074, .08), (.24, cx, .075, .073, .073)], n=12), 'shoeflame', sb, 0.05, proj=flame[1])
    finish(tube('z', [(.225, cx, .076, .079, .079), (.252, cx, .077, .076, .076)], n=12), 'rust', sb, 0.05)                           # padded collar
    finish(sphere((cx, .0, .205), (.052, .03, .06), rot=(.35, 0, 0), u=10, v=6), 'rust', sb, 0.05)                                      # tongue
    finish(sphere((cx, -.205, .052), (.082, .082, .044), u=10, v=6), 'lilac', sb, 0.05)                                                 # rubber toe cap
    SOLE = [(.165, .026, .074, .026), (.1, .025, .082, .025), (.0, .027, .08, .024), (-.12, .025, .088, .025), (-.22, .026, .086, .026), (-.28, .03, .064, .022), (-.3, .036, .04, .016)]
    finish(loft([sring(Vector((cx, y, cz)), X3, Z3, rx, rz, 12, 4.0) for y, cz, rx, rz in SOLE[::2] + [SOLE[-1]]]), 'white', sb, 0.05)
    finish(loft([sring(Vector((cx, y, cz + rz * .25)), X3, Z3, rx + .002, .004, 12, 4.0) for y, cz, rx, rz in SOLE[:-1:2]]), 'lining', sb, 0.05)
    for k in range(6):
        finish(cube((cx, -.012 - k * .027, .205 - k * .021), (.07, .012, .011), rot=(.6, 0, 0)), 'white', sb, 0.05, smooth=False)


# ================================================================ weights
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length


gidx = {n: i for i, n in enumerate(BONE_NAMES)}
for verts, bones, sigma in PARTS:
    bones = [b for b in bones if b in BONES]
    for v in verts:
        if not v.is_valid: continue
        d = [(seg_dist(v.co, *BONES[b]), b) for b in bones]
        dm = min(x for x, _ in d)
        w = [(math.exp(-(x * x - dm * dm) / (sigma * sigma)), b) for x, b in d]
        w.sort(reverse=True)
        w = [(a, b) for a, b in w[:4] if a > 0.02]
        tot = sum(a for a, _ in w)
        for a, b in w:
            v[DL][gidx[b]] = a / tot

# ================================================================ object, materials, split, export
me = bpy.data.meshes.new('Pyre')
bm.to_mesh(me)
bm.free()
obj = bpy.data.objects.new('Pyre', me)
bpy.context.scene.collection.objects.link(obj)
for n in BONE_NAMES:
    obj.vertex_groups.new(name=n)
mod = obj.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
obj.parent = arm
img = bpy.data.images.load(os.path.join(HERE, 'atlas.png'))
img.colorspace_settings.name = 'sRGB'


def make_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    return m


me.materials.append(make_mat('Pyre'))
me.materials.append(make_mat('PyreFlame'))
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
obj.active_material_index = 1
bpy.ops.object.material_slot_select()
bpy.ops.mesh.separate(type='SELECTED')
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.name = 'Pyre_Flame' if o.data.materials and o.data.polygons and o.data.materials[o.data.polygons[0].material_index].name == 'PyreFlame' else 'Pyre'
        o.data.name = o.name
        print('MESH', o.name, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'verts', len(o.data.vertices))

# ================================================================ rest pose: relaxed A-pose, elbows bent, wrists turned in
# Clips set each bone's local rotation outright, so a bent bind pose still plays every existing animation correctly;
# it only changes how he looks unanimated and makes shoulders/elbows deform from a natural angle.


def rest_rot(name, axis, deg):
    pb = arm.pose.bones[name]
    h = arm.matrix_world @ pb.head
    pb.matrix = (Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h)) @ pb.matrix
    bpy.context.view_layer.update()


for s_, sf in ((1, '_l'), (-1, '_r')):
    rest_rot('upperarm' + sf, 'Y', s_ * 48)          # arms down to ~45 degrees
    rest_rot('upperarm' + sf, 'X', -6)               # a touch forward
    rest_rot('lowerarm' + sf, 'X', -20)              # elbows bent forward
    rest_rot('lowerarm' + sf, 'Y', s_ * 6)
    rest_rot('hand' + sf, 'Y', -s_ * 12)             # wrists in
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:                                     # bake the posed shape into the meshes, then make the pose the new rest
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='Armature')
    m = o.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_skins=True, export_yup=True, export_apply=False,
                          export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False, export_image_format='AUTO')
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB')
