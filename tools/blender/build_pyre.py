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


def finish(verts, cell, bones, sigma=0.06, mat=MAIN, smooth=True):
    vs = set(verts)
    faces = [f for f in {f for v in verts for f in v.link_faces} if all(v in vs for v in f.verts)]
    for f in faces:
        f.material_index = mat
        f.smooth = smooth
        if cell:
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
    if t <= specs[0][0]: return specs[0][1:]
    for a, b in zip(specs, specs[1:]):
        if t <= b[0]:
            k = (t - a[0]) / (b[0] - a[0])
            return tuple(a[i] + (b[i] - a[i]) * k for i in range(1, 5))
    return specs[-1][1:]


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
# Proportions follow the concept sheet: big round skate helmet, broad shoulders tapering to a narrow waist, bare muscular arms,
# baggy cargo pants that balloon at the knee and bunch over chunky high-top skate shoes.
X3, Y3, Z3 = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
HEAD_SCALE, HEAD_PIVOT = 1.32, Vector((0, .02, 1.585))          # the whole head group (face, helmet, flame) is built at body scale, then blown up
HEAD_C, HEAD_R = (0.0, 0.02, 1.715), (0.094, 0.106, 0.122)
HC, HR = (0.0, 0.03, 1.728), (0.114, 0.13, 0.124)               # helmet shell

# --- torso profiles (z, c1, c2, r1, r2) ---------------------------------------------------
HOODIE = [(.93, 0, .04, .2, .145), (1.05, 0, .03, .184, .134), (1.17, 0, .02, .176, .126), (1.32, 0, .0, .228, .145), (1.43, 0, .008, .25, .15), (1.5, 0, .03, .2, .12), (1.56, 0, .04, .1, .085)]
VEST = [(1.0, 0, .025, .212, .156), (1.15, 0, .016, .196, .142), (1.31, 0, .0, .242, .162), (1.43, 0, .008, .265, .164), (1.505, 0, .03, .226, .132)]
TORSO_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']


def vest_prof(z): return lerp_spec(VEST, z)


def vest_front_y(x, z, out=0.0):
    c1, c2, r1, r2 = vest_prof(z)
    return c2 - r2 * math.sqrt(max(0.0, 1 - ((x - c1) / r1) ** 2)) - out


def patch(cell, z, x, size, rot=0.0, front=True):
    """a sewn patch: a black backing a bit larger than the art, both lifted off the denim so they read as separate pieces"""
    torso_decal('black', vest_prof, z, x, size * 1.2, size * 1.2, front=front, inset=.007, rot=rot)
    torso_decal(cell, vest_prof, z, x, size, size, front=front, inset=.011, rot=rot)


# hoodie body + neckline + hood draped behind the neck + drawstrings
finish(tube('z', HOODIE, n=18), 'hoodie', TORSO_BONES, 0.07)
finish(tube('z', [(1.49, 0, .03, .125, .108, .05), (1.565, 0, .035, .112, .098, .05)], n=14), 'hoodie', ['spine_03', 'neck_01'], 0.06)
finish(sphere((0, .085, 1.55), (.16, .115, .085), u=12, v=8), 'hoodie', ['spine_03', 'neck_01'], 0.06)
for s in (1, -1):
    finish(tube('z', [(1.5, s * .036, -.13, .006, .006), (1.42, s * .04, -.145, .006, .006), (1.35, s * .038, -.15, .006, .006)], n=5), 'tape', ['spine_03', 'spine_02'], 0.05)
    finish(cube((s * .038, -.152, 1.335), (.014, .014, .03)), 'silver', ['spine_02'], 0.05, smooth=False)

# denim vest: open front, sleeveless, frayed hem and armholes, placket with buttons, chest flap pockets, collar
vs = tube('z', VEST, n=18, caps=False)
slit = [f for f in {f for v in vs for f in v.link_faces} if f.calc_center_median().y < 0.0 and abs(f.calc_center_median().x) < 0.06]
bmesh.ops.delete(bm, geom=slit, context='FACES_ONLY')
finish([v for v in vs if v.is_valid], 'denim', TORSO_BONES, 0.07)
for k in range(-5, 6):                                                    # ripped hem
    x = k * 0.04
    c1, c2, r1, r2 = vest_prof(1.0)
    for sy in (-1, 1):
        if sy < 0 and abs(x) < 0.07: continue
        y = c2 + sy * r2 * math.sqrt(max(0, 1 - (x / r1) ** 2))
        finish(cone((x, y, .985 - (k % 2) * .01), 0.02, 0.0, 0.045 + (k % 3) * .018, rot=(math.pi, 0, 0), seg=4), 'denim', TORSO_BONES, 0.07, smooth=False)
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    for z in (1.42, 1.31, 1.2, 1.09):                                     # placket + buttons
        finish(sphere((s * .07, vest_front_y(s * .07, z, .012), z), (.011, .008, .011), u=6, v=4), 'silver', TORSO_BONES, 0.07)
    finish(cube((s * .07, vest_front_y(s * .07, 1.25, .004) + .004, 1.25), (.026, .012, .5)), 'denimDark', TORSO_BONES, 0.07, smooth=False)
    # chest pocket: flap + button
    finish(cube((s * .15, vest_front_y(s * .15, 1.355, .006), 1.355), (.1, .014, .04), rot=(0, 0, s * .03)), 'denimDark', TORSO_BONES, 0.07, smooth=False)
    finish(sphere((s * .15, vest_front_y(s * .15, 1.345, .017), 1.345), (.009, .006, .009), u=6, v=4), 'silver', TORSO_BONES, 0.07)
    # collar: folded lapels around the hood
    finish(cube((s * .095, -.098, 1.47), (.055, .02, .1), rot=(-.45, 0, s * .55)), 'denimDark', ['spine_03', 'clavicle' + sf], 0.07, smooth=False)
    # shoulder spikes flaring outward + frayed armhole threads
    for k, (dx, dz, ang) in enumerate(((.205, 1.52, .75), (.235, 1.505, 1.0), (.258, 1.48, 1.25))):
        for dy in (-.035, .045):
            finish(cone((s * dx, dy, dz), .017, .0, .06, rot=(0, s * ang, 0), seg=5), 'silver' if dy < 0 else 'denimDark', ['clavicle' + sf, 'spine_03'], 0.06, smooth=False)
    for k in range(7):
        a = -1.2 + k * .4
        finish(cone((s * .262, .01 + math.sin(a) * .075, 1.42 + math.cos(a) * .05), .009, 0, .035, rot=(0, s * 1.7, 0), seg=3), 'denim', ['clavicle' + sf, 'spine_03'], 0.06, smooth=False)
# patches front + the CRASH back patch
patch('p_mushroom', 1.445, -.13, .055, rot=.12)
patch('p_skull', 1.27, -.15, .06, rot=-.1)
patch('p_bolt', 1.15, -.13, .055, rot=.15)
patch('p_sticker1', 1.05, -.17, .045, rot=.2)
patch('p_heart', 1.445, .13, .055, rot=-.2)
patch('p_x', 1.27, .155, .055, rot=.2)
patch('p_star', 1.15, .13, .05, rot=.3)
patch('p_sticker2', 1.05, .17, .045, rot=-.15)
patch('p_crash', 1.28, 0.0, .29, front=False)
patch('p_sticker3', 1.07, .12, .05, rot=.2, front=False)

# --- neck ---------------------------------------------------------------------------------
finish(tube('z', [(1.49, 0, .035, .056, .056), (1.64, 0, .02, .054, .054)], n=10), 'skin', ['spine_03', 'neck_01', 'Head'], 0.05)

# --- head group (built at 1x, scaled at the end of the block) -----------------------------
head_from = len(PARTS)
fv = sphere(HEAD_C, HEAD_R, u=18, v=12)                                           # blank oval face: the jaw tapers
for v in fv:
    t = max(0.0, (HEAD_C[2] - v.co.z) / HEAD_R[2])
    v.co.x *= 1 - .22 * t
    v.co.y = HEAD_C[1] + (v.co.y - HEAD_C[1]) * (1 - .1 * t)
finish(fv, 'face', ['Head'], 0.02)
# skate helmet: round shell that covers the top, sides and back; the face opening starts at the brow
hv = sphere(HC, HR, u=20, v=14)
for v in hv:
    d = Vector(((v.co.x - HC[0]) / HR[0], (v.co.y - HC[1]) / HR[1], (v.co.z - HC[2]) / HR[2]))
    f = max(0.0, min(1.0, (-d.y - .2) / .5))
    f = f * f * (3 - 2 * f)
    thr = HC[2] + (-.075 + (.012 + .075) * f) * (HR[2] / .124)
    if v.co.z < thr: v.co.z = thr
finish(hv, 'helmet', ['Head'], 0.02)
# cracks radiating from where the flame erupts + stickers
for p0, p1, wd in (((.0, -.05, 1.85), (.05, -.1, 1.8), .008), ((.05, -.1, 1.8), (.09, -.08, 1.76), .007), ((.0, .06, 1.85), (.07, .1, 1.79), .008),
                   ((-.01, -.03, 1.85), (-.07, -.06, 1.82), .008), ((-.07, -.06, 1.82), (-.11, -.03, 1.77), .007), ((-.01, .07, 1.85), (-.08, .11, 1.8), .007)):
    ellipsoid_decal('flame', HC, HR, p0, p1, wd, inset=.003)
ellipsoid_decal('p_sticker1', HC, HR, (.11, -.03, 1.72), (.112, -.03, 1.77), .055, inset=.003)
ellipsoid_decal('p_sticker3', HC, HR, (-.11, .03, 1.73), (-.112, .03, 1.775), .05, inset=.003)
ellipsoid_decal('p_skull', HC, HR, (.06, .1, 1.72), (.06, .105, 1.77), .045, inset=.003)
ellipsoid_decal('p_star', HC, HR, (-.04, .12, 1.69), (-.04, .125, 1.735), .04, inset=.003)


def tongue(base, h, w, th, bend, side, col, segs=5, wave=0.0):
    """one tongue of flame: a lofted blade, thin across X, wide along Y, curling back (+Y) and sideways as it rises"""
    rings = []
    for i in range(segs + 1):
        t = i / segs
        c = Vector(base) + Vector((side * t * t * h * .45, bend * t * t * h + wave * w * math.sin(t * math.pi * 1.6), h * t))
        r = max(.003, w * (1 - t) ** 0.85)
        rings.append(ring(c, X3, Y3, max(.003, th * (1 - .75 * t)), r, 6))
    finish(loft(rings), col, ['Head'], 0.02, mat=FLAME, smooth=False)


top = HC[2] + HR[2] - .012
finish(sphere((0, .0, top), (.04, .1, .03), u=8, v=6), 'flame', ['Head'], 0.02, mat=FLAME, smooth=False)       # where it bursts out of the shell
#      y,    x,    h,    w,    bend, side, wave
CREST = [(-.02, 0, .38, .08, .45, 0, .5), (.05, 0, .25, .065, .65, 0, -.4), (-.08, 0, .17, .05, .15, 0, .6), (.1, 0, .16, .045, .9, 0, .3),
         (.0, .03, .19, .045, .45, .55, .4), (.0, -.03, .19, .045, .45, -.55, -.4), (.07, .025, .14, .038, .7, .6, 0), (.07, -.025, .14, .038, .7, -.6, 0),
         (-.06, .02, .11, .03, .1, .5, .3), (-.06, -.02, .11, .03, .1, -.5, -.3)]
for y, x, h, w, bend, side, wave in CREST:
    base = (x, y, top - .015)
    tongue(base, h, w, .022, bend, side, 'flame', wave=wave)
    tongue((x, y - .008, top - .01), h * .62, w * .55, .03, bend * .9, side, 'yellow', segs=4, wave=wave)
for v in {v for p in PARTS[head_from:] for v in p[0]}:
    v.co = HEAD_PIVOT + (v.co - HEAD_PIVOT) * HEAD_SCALE

# --- arms: bare, muscular, stacked wristbands, bare hands ----------------------------------
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    ab = ['clavicle' + sf, 'upperarm' + sf, 'lowerarm' + sf, 'hand' + sf]
    #                t     cy    cz     ry    rz
    finish(tube('x', [(.16, .06, 1.462, .07, .066), (.24, .064, 1.466, .08, .078), (.31, .067, 1.458, .066, .064), (.39, .07, 1.455, .07, .064),
                      (.46, .073, 1.456, .047, .045), (.53, .073, 1.456, .058, .053), (.63, .069, 1.456, .043, .039), (.705, .065, 1.456, .035, .032)], n=12, s=s), 'skin', ab, 0.05)
    for k, (xt, col) in enumerate(((.63, 'black'), (.652, 'black'), (.674, 'pink'))):
        finish(tube('x', [(xt, .067, 1.456, .045, .042), (xt + .016, .067, 1.456, .045, .042)], n=10, s=s), col, ab[2:], 0.03)
    finish(sphere((s * .765, .066, 1.452), (.06, .05, .024), u=10, v=6), 'skin', ab[2:], 0.03)                                     # palm
    finish(sphere((s * .835, .062, 1.446), (.05, .046, .02), rot=(0, s * .25, 0), u=10, v=6), 'skin', ab[3:], 0.03)                 # fingers (curled a little)
    finish(sphere((s * .775, .018, 1.44), (.034, .03, .019), rot=(0, 0, s * .5), u=8, v=6), 'skin', ab[3:], 0.03)                  # thumb

# --- pelvis, belt, hip chain --------------------------------------------------------------
finish(tube('z', [(1.03, 0, .03, .19, .14), (.95, 0, .035, .208, .15), (.86, 0, .035, .205, .145)], n=18), 'cargo', ['pelvis', 'spine_01', 'thigh_l', 'thigh_r'], 0.07)
finish(tube('z', [(1.0, 0, .03, .203, .152), (1.035, 0, .03, .203, .152)], n=18), 'black', ['pelvis', 'spine_01'], 0.05)
finish(cube((0, -.183, 1.018), (.055, .02, .038)), 'silver', ['pelvis'], 0.03, smooth=False)
for k in range(10):                                                                       # studs on the belt
    a = -2.6 + k * .58
    finish(cube((math.sin(a) * .206, .03 - math.cos(a) * .155, 1.018), (.014, .014, .014), rot=(0, 0, a)), 'silver', ['pelvis'], 0.04, smooth=False)


def link(p, ang_z, alt, R=.024, Rz=.03, r=.0075):
    rows = []
    for a in range(8):
        aa = 2 * math.pi * a / 8
        c = Vector((math.cos(aa) * R, 0, math.sin(aa) * Rz))
        rows.append([Matrix.Rotation(ang_z + (math.pi / 2 if alt else 0), 3, 'Z') @ (c + Vector((math.cos(2 * math.pi * b / 5) * r * math.cos(aa), math.sin(2 * math.pi * b / 5) * r, math.cos(2 * math.pi * b / 5) * r * math.sin(aa)))) + p for b in range(5)])
    return loft(rows, wrap=True)


for i in range(14):                                                                       # heavy hip chain: front belt loop -> back pocket
    t = i / 13
    p = Vector((-.15 - .09 * math.sin(math.pi * t), -.15 + .3 * t, .99 - .21 * math.sin(math.pi * t)))
    finish(link(p, math.atan2(.3, -.09 * math.pi * math.cos(math.pi * t)), i % 2), 'silver', ['pelvis', 'thigh_r'], 0.05)

# --- legs: baggy cargos (widest at the knee, gathering into folds over the shoes) ----------
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    lb = ['pelvis', 'thigh' + sf, 'calf' + sf, 'foot' + sf]
    X = lambda x: s * x
    #                 z     cx         cy    rx    ry    folds
    LEG = [(.99, X(.112), .036, .112, .124, .0), (.84, X(.12), .036, .116, .126, .03), (.68, X(.128), .04, .124, .13, .05), (.55, X(.13), .046, .128, .134, .07),
           (.42, X(.126), .056, .118, .126, .06), (.33, X(.122), .066, .106, .114, .05), (.27, X(.118), .074, .094, .1, .08), (.235, X(.116), .08, .106, .11, .1),
           (.205, X(.115), .084, .094, .098, .08), (.175, X(.114), .088, .104, .108, .06), (.15, X(.114), .09, .108, .112, .03)]
    finish(tube('z', LEG, n=14), 'cargo', lb, 0.06)
    # big cargo pocket with depth, flap, button
    px = X(.128 + .118 - .004)
    finish(cube((px, .045, .7), (.05, .15, .17)), 'cargo', lb[:3], 0.05, smooth=False)
    finish(cube((px + X(.006), .045, .69), (.04, .13, .145)), 'cargoDark', lb[:3], 0.05, smooth=False)
    finish(cube((px + X(.01), .045, .79), (.056, .16, .055), rot=(0, X(.12), 0)), 'cargo', lb[:3], 0.05, smooth=False)
    finish(sphere((px + X(.04), .045, .775), (.01, .012, .012), u=6, v=4), 'black', lb[:3], 0.05)

    # --- chunky 2000s high-top skate shoe
    cx = X(.114)
    sb = ['calf' + sf, 'foot' + sf, 'ball' + sf]
    finish(tube('y', [(.17, cx, .115, .072, .095), (.10, cx, .15, .086, .125), (0, cx, .125, .094, .1), (-.12, cx, .095, .096, .072), (-.24, cx, .078, .09, .056), (-.31, cx, .068, .07, .042)], n=14), 'shoe', sb, 0.05)
    finish(tube('z', [(.08, cx, .09, .086, .09), (.19, cx, .086, .082, .082)], n=14), 'shoe', sb, 0.05)
    finish(tube('z', [(.18, cx, .086, .09, .09), (.21, cx, .087, .087, .087)], n=14), 'shoeGrey', sb, 0.05)                         # padded collar
    finish(tube('y', [(.195, cx, .032, .098, .032), (.1, cx, .03, .106, .036), (-.1, cx, .03, .11, .036), (-.26, cx, .033, .102, .036), (-.34, cx, .04, .075, .034)], n=10), 'sole', sb, 0.05)
    finish(tube('y', [(.19, cx, .066, .1, .007), (-.335, cx, .066, .078, .007)], n=10), 'white', sb, 0.05)                           # midsole stripe
    finish(sphere((cx, -.275, .072), (.088, .07, .054), u=12, v=8), 'shoeGrey', sb, 0.05)                                              # toe cap
    finish(sphere((cx, -.02, .2), (.06, .034, .07), rot=(.6, 0, 0), u=10, v=6), 'shoeGrey', sb, 0.05)                           # fat tongue
    for k in range(4):
        finish(cube((cx, -.055 - k * .04, .175 - k * .022), (.1, .013, .012), rot=(.5, 0, 0)), 'black', sb, 0.05, smooth=False)
    for side in (1, -1):                                                                                                              # flames on both sides
        flat_decal('p_flame', (cx + X(side * .1), -.07, .1), .28, .085, s * side, bones=sb)

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

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=False, export_skins=True, export_yup=True, export_apply=False,
                          export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False, export_image_format='AUTO')
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB')
