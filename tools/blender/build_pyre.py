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


def ring(c, u, v, ru, rv, n):
    return [c + u * (ru * math.cos(2 * math.pi * k / n)) + v * (rv * math.sin(2 * math.pi * k / n)) for k in range(n)]


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
    for t, c1, c2, r1, r2 in specs:
        if axis == 'z':
            out.append(ring(Vector((c1, c2, t)), X, Y, r1, r2, n))
        elif axis == 'x':
            out.append(ring(Vector((s * t, c1, c2)), Y, Z, r1, r2, n) if s > 0 else ring(Vector((s * t, c1, c2)), Z, Y, r2, r1, n))
        else:
            out.append(ring(Vector((c1, t, c2)), X, Z, r1, r2, n))
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
HEAD_C, HEAD_R = (0.0, 0.02, 1.715), (0.098, 0.112, 0.125)
L_ARM = [('upperarm_%s', 'lowerarm_%s')]

# --- torso profiles (z, c1, c2, r1, r2) ---------------------------------------------------
HOODIE = [(.93, 0, .04, .205, .15), (1.05, 0, .03, .195, .14), (1.2, 0, .015, .18, .126), (1.34, 0, .0, .21, .14), (1.45, 0, .01, .222, .14), (1.52, 0, .035, .14, .1), (1.575, 0, .04, .085, .08)]
VEST = [(1.02, 0, .02, .207, .148), (1.16, 0, .012, .197, .137), (1.32, 0, .0, .224, .152), (1.44, 0, .01, .237, .152), (1.505, 0, .03, .207, .117)]
TORSO_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']


def vest_prof(z): return lerp_spec(VEST, z)


# hoodie
vs = tube('z', HOODIE, n=16)
finish(vs, 'hoodie', TORSO_BONES, 0.07)
# hood bundled behind the neck + drawstring
finish(sphere((0, .075, 1.565), (.118, .09, .07), u=12, v=8), 'hoodie', ['spine_03', 'neck_01'], 0.06)

# denim vest: open at the front, sleeveless, ripped hem
vs = tube('z', VEST, n=16, caps=False)
slit = [f for f in {f for v in vs for f in v.link_faces} if f.calc_center_median().y < 0.0 and abs(f.calc_center_median().x) < 0.058]
bmesh.ops.delete(bm, geom=slit, context='FACES_ONLY')
vs = [v for v in vs if v.is_valid]
finish(vs, 'denim', TORSO_BONES, 0.07)
for k in range(-4, 5):                                              # ripped hem along the bottom edge
    x = k * 0.043
    c1, c2, r1, r2 = vest_prof(1.02)
    if abs(x) < 0.058: pass
    for side, sy in ((0, -1), (1, 1)):
        if side == 0 and abs(x) < 0.062: continue
        y = c2 + sy * r2 * math.sqrt(max(0, 1 - (x / r1) ** 2))
        finish(cone((x, y, 1.0 - (k % 2) * .012), 0.02, 0.0, 0.055 + (k % 3) * .018, rot=(math.pi, 0, 0), seg=4), 'denim', TORSO_BONES, 0.07)
# patches on the vest
torso_decal('p_mushroom', vest_prof, 1.40, .115, .075, .075, rot=.12)
torso_decal('p_skull', vest_prof, 1.40, -.115, .07, .07, rot=-.1)
torso_decal('p_heart', vest_prof, 1.29, .15, .06, .06, rot=-.2)
torso_decal('p_bolt', vest_prof, 1.27, -.15, .06, .06, rot=.15)
torso_decal('p_star', vest_prof, 1.12, .13, .05, .05, rot=.3)
torso_decal('p_x', vest_prof, 1.13, -.13, .05, .05, rot=.2)
torso_decal('p_sticker1', vest_prof, 1.47, -.17, .045, .045, rot=.2)
torso_decal('p_sticker2', vest_prof, 1.20, .175, .05, .05, rot=-.15)
torso_decal('p_crash', vest_prof, 1.30, 0.0, .27, .27, front=False, inset=.004)
torso_decal('p_sticker3', vest_prof, 1.08, .09, .05, .05, front=False, rot=.2)

# --- neck, head ---------------------------------------------------------------------------
finish(tube('z', [(1.50, 0, .04, .052, .052), (1.63, 0, .02, .05, .05)], n=10), 'skin', ['spine_03', 'neck_01', 'Head'], 0.05)
finish(sphere(HEAD_C, HEAD_R, u=18, v=12), 'face', ['Head'], 0.02)

# helmet: a dome that wraps the back and top of the skull, brow line slopes down at the back
hv = sphere((HEAD_C[0], HEAD_C[1] + .006, HEAD_C[2] + .008), (HEAD_R[0] + .016, HEAD_R[1] + .018, HEAD_R[2] + .014), u=18, v=12)
for v in hv:
    thr = HEAD_C[2] + (-(v.co.y - HEAD_C[1]) * .35 - .045) + .008
    if v.co.z < thr: v.co.z = thr
finish(hv, 'helmet', ['Head'], 0.02)
finish(cube((0, -.122, 1.79), (.17, .075, .012), rot=(-.28, 0, 0)), 'black', ['Head'], 0.02, smooth=False)         # peak
for s in (1, -1):
    finish(sphere((s * .106, .028, 1.712), (.026, .052, .056), u=8, v=6), 'helmetLight', ['Head'], 0.02)               # ear covers
    finish(sphere((s * .108, .028, 1.712), (.01, .03, .032), u=8, v=6), 'black', ['Head'], 0.02)
    finish(tube('z', [(1.675, s * .1, .03, .006, .006), (1.64, s * .075, -.02, .006, .006), (1.62, s * .03, -.07, .006, .006)], n=4, caps=True), 'black', ['Head'], 0.02)  # chin strap
# cracks + stickers on the helmet (cracks are flame orange)
HC, HR = (HEAD_C[0], HEAD_C[1] + .006, HEAD_C[2] + .008), (HEAD_R[0] + .016, HEAD_R[1] + .018, HEAD_R[2] + .014)
for p0, p1, wd in (((.02, -.07, 1.85), (.07, .0, 1.80), .008), ((.07, .0, 1.80), (.11, .01, 1.76), .007), ((.07, .0, 1.80), (.05, .06, 1.82), .007),
                   ((-.05, -.03, 1.85), (-.09, .02, 1.80), .008), ((-.09, .02, 1.80), (-.12, .0, 1.77), .007)):
    ellipsoid_decal('flame', HC, HR, p0, p1, wd, inset=.003)
ellipsoid_decal('p_sticker1', HC, HR, (.108, -.02, 1.73), (.112, -.02, 1.77), .05, inset=.003)
ellipsoid_decal('p_sticker2', HC, HR, (-.108, .04, 1.74), (-.108, .04, 1.78), .05, inset=.003)
ellipsoid_decal('p_star', HC, HR, (0.0, .13, 1.76), (0.0, .13, 1.80), .045, inset=.003)

# flame mohawk: a row of faceted blades along the ridge (own material so the game can make it glow)
heights = [.07, .11, .15, .19, .22, .19, .15, .11, .07]
for i, hh in enumerate(heights):
    y = -.085 + i * .02
    dz = HC[2] + HR[2] * math.sqrt(max(0.0, 1 - ((y - HC[1]) / HR[1]) ** 2)) - .01
    for lay, (col, k) in enumerate((('flame', 1.0), ('yellow', .62))):
        bv = cone((0, y, dz + hh * k * .5 - .01 + lay * .004), 0.5, 0.0, hh * k, sc=(.034 - lay * .01, .075 - lay * .018, 1), seg=4, rot=(0, 0, math.pi / 4))
        for v in bv:
            if v.co.z > dz + hh * k - .02: v.co.y += .035 + hh * .12
        finish(bv, col, ['Head'], 0.02, mat=FLAME, smooth=False)
for i in range(3):                                                                          # loose licks of flame at the side
    for s in (1, -1):
        bv = cone((s * .03, .03 + i * .03, 1.86 + .05 - i * .01), .5, 0, .09 + i * .02, sc=(.025, .05, 1), seg=4, rot=(0, .25 * s, math.pi / 4))
        finish(bv, 'flame' if i % 2 else 'yellow', ['Head'], 0.02, mat=FLAME, smooth=False)

# --- arms (per side) -----------------------------------------------------------------------
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    ab = ['clavicle' + sf, 'upperarm' + sf, 'lowerarm' + sf, 'hand' + sf]
    # hoodie sleeve to the elbow, rolled cuff
    finish(tube('x', [(.19, .066, 1.456, .084, .084), (.34, .07, 1.456, .08, .08), (.49, .073, 1.456, .076, .076), (.53, .073, 1.456, .082, .082)], n=10, s=s), 'hoodie', ab[:3], 0.05)
    # bare forearm
    finish(tube('x', [(.5, .073, 1.456, .046, .046), (.61, .07, 1.456, .042, .042), (.71, .065, 1.456, .037, .037)], n=9, s=s), 'skin', ab[1:], 0.04)
    for xt in (.56, .60):                                                                       # tape wraps
        finish(tube('x', [(xt, .071, 1.456, .05, .05), (xt + .022, .071, 1.456, .05, .05)], n=9, s=s), 'tape', ab[1:3], 0.03)
    finish(tube('x', [(.655, .068, 1.456, .052, .052), (.695, .067, 1.456, .052, .052)], n=9, s=s), 'pink', ab[1:], 0.03)   # wristband
    # fingerless glove + skin fingertips
    finish(sphere((s * .765, .06, 1.452), (.06, .05, .05), rot=(0, 0, 0), u=10, v=7), 'black', ab[2:], 0.03)
    finish(cube((s * .83, .055, 1.448), (.075, .05, .04)), 'skin', ab[3:], 0.03, smooth=False)
    finish(sphere((s * .765, .02, 1.425), (.04, .025, .025), u=8, v=6), 'black', ab[3:], 0.03)                              # thumb
    # spiked denim shoulder
    for k, (dx, dy, ang) in enumerate(((0.205, .035, .1), (.235, .05, .7), (.255, .08, 1.15))):
        sp = cone((s * dx, dy, 1.535 + (0.02 if k == 0 else 0.0) - k * .012), .026, .0, .085, rot=(0, s * ang, 0), seg=5)
        finish(sp, 'denimDark', ['clavicle' + sf, 'spine_03'], 0.06, smooth=False)
    finish(tube('x', [(.17, .04, 1.505, .05, .028), (.26, .045, 1.5, .05, .028)], n=8, s=s), 'denim', ['clavicle' + sf, 'spine_03'], 0.06)  # shoulder strap

# --- pelvis + belt + chain -----------------------------------------------------------------
finish(tube('z', [(1.03, 0, .03, .178, .13), (.95, 0, .035, .198, .142), (.86, 0, .035, .192, .136)], n=16), 'cargo', ['pelvis', 'spine_01', 'thigh_l', 'thigh_r'], 0.07)
finish(tube('z', [(1.005, 0, .03, .193, .144), (1.04, 0, .03, .193, .144)], n=16), 'black', ['pelvis', 'spine_01'], 0.05)
finish(cube((0, -.172, 1.022), (.05, .02, .036)), 'silver', ['pelvis'], 0.03, smooth=False)                                     # buckle
# hip chain
for i in range(11):
    t = i / 10
    p = Vector((-.15 - .075 * math.sin(math.pi * t * .9) , -.125 + .13 * t, .995 - .24 * math.sin(math.pi * t * .55)))
    rot = (math.pi / 2 if i % 2 else 0, 0.0, 0.0)
    rr = [ring(Vector((0.0, 0.0, 0.0)), Vector((1, 0, 0)), Vector((0, 1, 0)), .02, .026, 8)]
    ln = []
    for a in range(8):
        ang = 2 * math.pi * a / 8
        c = Vector((math.cos(ang) * .02, 0, math.sin(ang) * .026))
        rg = []
        for b in range(5):
            bb = 2 * math.pi * b / 5
            rg.append(Matrix.Rotation(rot[0], 3, 'Z') @ (c + Vector((math.cos(bb) * .005, math.sin(bb) * .005, 0)) + Vector((0, 0, 0))) + p)
        ln.append(rg)
    lv = loft(ln, wrap=True)
    finish(lv, 'silver', ['pelvis', 'thigh_r'], 0.05)
# chain across the chest
for i in range(9):
    t = i / 8
    p = Vector((.17 - .34 * t, -.158 + .0, 1.43 - .05 * math.sin(math.pi * t) - .06 * t))
    c2, _, r1, r2 = vest_prof(p.z)[0], 0, vest_prof(p.z)[2], vest_prof(p.z)[3]
    ln = []
    for a in range(8):
        ang = 2 * math.pi * a / 8
        c = Vector((math.cos(ang) * .018, 0, math.sin(ang) * .018))
        ln.append([Matrix.Rotation(math.pi / 2 if i % 2 else 0, 3, 'Z') @ (c + Vector((math.cos(bb) * .0045, math.sin(bb) * .0045, 0))) + Vector((p.x, vest_prof(p.z)[1] - vest_prof(p.z)[3] * math.sqrt(max(0, 1 - (p.x / vest_prof(p.z)[2]) ** 2)) - .012, p.z)) for bb in [2 * math.pi * b / 5 for b in range(5)]])
    finish(loft(ln, wrap=True), 'silver', ['spine_03', 'spine_02'], 0.05)

# --- legs + shoes (per side) ---------------------------------------------------------------
for s in (1, -1):
    sf = '_l' if s > 0 else '_r'
    cx = s * .114
    lb = ['pelvis', 'thigh' + sf, 'calf' + sf, 'foot' + sf]
    finish(tube('z', [(.99, cx, .036, .108, .118), (.78, cx, .04, .106, .114), (.55, cx, .045, .1, .108), (.34, cx, .06, .104, .112), (.17, cx, .082, .112, .118)], n=12), 'cargo', lb, 0.06)
    finish(tube('z', [(.175, cx, .082, .12, .124), (.13, cx, .085, .124, .128)], n=12), 'cargoDark', lb[2:], 0.04)                  # rolled cuff
    # cargo pocket + flap + strap
    finish(cube((s * (.114 + .108), .03, .70), (.058, .17, .19)), 'cargoDark', lb[:3], 0.05, smooth=False)
    finish(cube((s * (.114 + .112), .03, .775), (.062, .175, .06)), 'cargo', lb[:3], 0.05, smooth=False)
    finish(cube((s * (.114 + .115), .03, .745), (.064, .02, .12)), 'black', lb[:3], 0.05, smooth=False)
    # high-top sneaker: toe-to-heel loft, fat orange sole, grey toe cap, tongue + laces, flame decal on the outside
    sb = ['calf' + sf, 'foot' + sf, 'ball' + sf]
    finish(tube('y', [(.135, cx, .105, .062, .088), (.065, cx, .135, .07, .104), (-.04, cx, .088, .076, .074), (-.15, cx, .066, .072, .054), (-.25, cx, .052, .058, .042)], n=12), 'shoe', sb, 0.05)
    finish(tube('z', [(.07, cx, .084, .07, .078), (.19, cx, .068, .07, .07), (.235, cx, .072, .075, .075)], n=12), 'shoe', sb, 0.05)
    finish(tube('z', [(.222, cx, .071, .076, .078), (.245, cx, .072, .077, .08)], n=12), 'shoeGrey', sb, 0.05)                           # padded collar
    finish(cube((cx, -.056, .026), (.158, .41, .056)), 'sole', sb, 0.05, smooth=False)
    finish(cube((cx, -.056, .063), (.162, .418, .014)), 'white', sb, 0.05, smooth=False)                                                   # midsole line
    finish(sphere((cx, -.215, .06), (.062, .06, .05), u=10, v=7), 'shoeGrey', sb, 0.05)
    finish(cube((cx, .0, .23), (.075, .035, .1), rot=(.35, 0, 0)), 'shoeGrey', sb, 0.05, smooth=False)
    for k in range(3):
        finish(cube((cx, -.01 - k * .052, .185 - k * .042), (.082, .012, .01), rot=(.55, 0, 0)), 'black', sb, 0.05, smooth=False)
    ox = cx + s * (.08)
    flat_decal('p_flame', (ox, -.055, .105), .21, .06, s, rot=0.0, bones=sb)

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
