"""Bake the city-lights emission layer for the fixed Lake Union view.

Everything here is pre-engineered for one camera: the camera sits north of
Lake Union looking south, so the Wallingford street grid converges toward a
vanishing point over downtown, I-5 runs down the left side, Elliott Bay sits
top right. Inputs: masks from masks.py at the same N. Output: lights.jpg
(additive emission on black) and bloom.jpg (pre-blurred glow), plus a
debug composite.
"""
import numpy as np, os, sys, math
from PIL import Image
from scipy import ndimage as ndi

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1800
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
M = lambda n: np.load(os.path.join(OUT, n + '.npy'))
water, sky, cloud, veg, built, parks = (M(k) for k in ('water', 'sky', 'cloud', 'veg', 'built', 'parks'))
z_down, z_slu, z_port = M('zone_downtown'), M('zone_slu'), M('zone_port')
photo = np.asarray(Image.open(os.path.join(HERE, '..', 'original.png')).convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
albedo = photo.mean(-1)
rng = np.random.default_rng(20261122)

YH = 0.12                      # effective horizon for the ground plane
VP = (0.50, 0.16)              # where the N-S avenues of Wallingford converge (measured)
def s_of(y): return np.clip((y - YH) / (1 - YH), 0.035, 1.0)
def at(m, x, y):
    i = np.clip((np.asarray(y) * N).astype(int), 0, N - 1); j = np.clip((np.asarray(x) * N).astype(int), 0, N - 1)
    return m[i, j]

# --- colour temperatures (linear-ish RGB, 0..1) ---
C = {
    'led':    np.array([1.00, 0.93, 0.80]),   # residential LED cobra heads, ~3500-4000 K
    'artery': np.array([1.00, 0.90, 0.74]),
    'window': np.array([1.00, 0.72, 0.42]),   # incandescent/2700 K interiors
    'office': np.array([0.80, 0.88, 1.00]),   # tower floors, fluorescent/LED panels
    'shop':   np.array([1.00, 0.82, 0.60]),
    'head':   np.array([0.95, 0.96, 1.00]),
    'tail':   np.array([1.00, 0.14, 0.08]),
    'port':   np.array([1.00, 0.78, 0.50]),
    'sodium': np.array([1.00, 0.58, 0.22]),   # older high-pressure sodium heads still mixed in
    'neon_r': np.array([1.00, 0.20, 0.24]),
    'neon_t': np.array([0.25, 0.95, 0.90]),
    'neon_v': np.array([0.70, 0.40, 1.00]),
}

pts = []   # (x, y, rgb*intensity, radius_px, elong)
def add(x, y, col, inten, r, elong=1.0, kind=0, dim=1.0):
    # dim is applied when rasterising, not here: the glint selection below thresholds on intensity and then draws
    # rng numbers per selected light, so dimming in place would reshuffle every later random draw (tower windows...).
    pts.append((x, y, col[0] * inten, col[1] * inten, col[2] * inten, r, elong, kind, dim))

def polyline_samples(P, spacing_fn):
    P = np.asarray(P, float); out = []
    for (x0, y0), (x1, y1) in zip(P[:-1], P[1:]):
        t = 0.0; L = math.hypot(x1 - x0, y1 - y0)
        while t < L:
            x = x0 + (x1 - x0) * t / L; y = y0 + (y1 - y0) * t / L
            out.append((x, y)); t += spacing_fn(y)
    return out

def offset_line(P, off):
    P = np.asarray(P, float); Q = []
    for i in range(len(P)):
        a = P[max(i - 1, 0)]; b = P[min(i + 1, len(P) - 1)]
        dx, dy = b - a; n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        s = s_of(P[i][1]); Q.append((P[i][0] + nx * off * s, P[i][1] + ny * off * s))
    return Q

# ================= 1. Wallingford / U-District residential grid (foreground) =================
K_D = 0.0996                     # one ~85 m block in inverse-depth units (calibrated shore -> frame bottom)
ew = []                          # E-W street "rows": y at x=0.5, phase-locked so one row runs along N 45th St
d45 = 1.0 / (0.757 - 0.05 * 0.26 * ((0.757 - YH) / (1 - YH)) - YH)
d = d45
while YH + 1.0 / (d - K_D) <= 1.03: d -= K_D
while True:
    y = YH + 1.0 / d
    if y < 0.475: break
    ew.append(y); d += K_D
TILT = 0.05                      # slight camera roll: E-W streets drop to the right
def ew_y(k, x): return ew[k] + TILT * (x - 0.5) * s_of(ew[k])
ns_bottom = [0.64 + j * 0.0733 for j in range(-12, 6)]
def ns_x(j, y):                  # ray from VP through (ns_bottom[j], 1.0)
    xb = ns_bottom[j]; t = (y - VP[1]) / (1.0 - VP[1]); return VP[0] + (xb - VP[0]) * t

# which rows/columns are arterials (measured against the photo)
row_45th = int(np.argmin([abs(ew_y(k, 0.76) - 0.757) for k in range(len(ew))]))   # N 45th St business strip
row_40th = int(np.argmin([abs(ew_y(k, 0.70) - 0.585) for k in range(len(ew))]))
col_wall = int(np.argmin([abs(x - 0.64) for x in ns_bottom]))                    # the clear avenue reaching the shore at x~0.64
col_b = int(np.argmin([abs(x - 0.86) for x in ns_bottom]))
art_rows, art_cols = {row_45th, row_40th}, {col_wall, col_b}

def fg_ok(x, y):
    if not (0 <= x <= 1 and 0.47 <= y <= 1): return False
    if at(water, x, y) > 0.3 or at(parks, x, y) > 0.5: return False
    # north shore industrial/park edge: keep grid south of the shore road
    return True

for k in range(len(ew)):
    for j in range(len(ns_bottom)):
        y0 = ew[k]; x = ns_x(j, y0); y = ew_y(k, x)
        if not fg_ok(x, y): continue
        s = s_of(y); art = (k in art_rows) or (j in art_cols)
        if art or rng.random() < 0.92:
            add(x, y, C['artery'] if art else C['led'], (5.0 if art else 3.6) * (0.8 + 0.4 * rng.random()), 2.0 * s + 0.45)
        # mid-block along the avenue toward the next row
        if k + 1 < len(ew):
            ym = 0.5 * (ew[k] + ew[k + 1]); xm = ns_x(j, ym); ym = ew_y(k, xm) * 0.5 + ew_y(k + 1, xm) * 0.5
            if fg_ok(xm, ym) and (j in art_cols or rng.random() < 0.55):
                add(xm, ym, C['artery'] if j in art_cols else C['led'], (4.2 if j in art_cols else 2.8) * (0.8 + 0.4 * rng.random()), 1.7 * s + 0.4)
        # arterial rows get quarter-block lights and lit shopfronts
        if k in art_rows and j + 1 < len(ns_bottom):
            for f in (0.25, 0.5, 0.75):
                xa = ns_x(j, y0) * (1 - f) + ns_x(j + 1, y0) * f; ya = ew_y(k, xa)
                if fg_ok(xa, ya):
                    add(xa, ya, C['artery'], 2.8, 1.6 * s + 0.4)
                    if k == row_45th and 0.50 < xa < 0.92:
                        for _ in range(3):
                            add(xa + (rng.random() - 0.5) * 0.02 * s, ya + (rng.random() - 0.3) * 0.012 * s, C['shop'], 0.9 * rng.random() + 0.3, 1.0 * s + 0.3, kind=1)
        # arterial columns: denser lights
        if j in art_cols and k + 1 < len(ew):
            for f in (0.25, 0.75):
                yq = ew[k] * (1 - f) + ew[k + 1] * f; xq = ns_x(j, yq)
                if fg_ok(xq, yq): add(xq, yq, C['artery'], 2.6, 1.5 * s + 0.4)

# house windows: sample built pixels in the foreground, warm, ~1 in 3 houses lit in the evening
cand = rng.random((60000, 2)); cand[:, 1] = 0.47 + cand[:, 1] * 0.53
for x, y in cand:
    b = at(built, x, y) * (1 - at(water, x, y)) * (1 - at(parks, x, y))
    if rng.random() < b * 0.10:
        s = s_of(y); add(x, y, C['window'], 0.6 + 0.9 * rng.random(), 1.0 * s + 0.3, kind=1)

# ================= 2. Far city: sample real built pixels, zone-weighted =================
# downtown tower silhouettes: darker than the haze behind them and bluish (glass). Deterministic (no rng).
Lp = (photo ** 2.2 * [0.2126, 0.7152, 0.0722]).sum(-1)
meanL = ndi.uniform_filter(Lp, int(N * 0.04)); blue = photo[..., 2] - photo[..., 0]
tower = np.clip((meanL - Lp) / (0.45 * meanL), 0, 1) * np.clip((blue + 0.01) / 0.05, 0, 1)
tower = ndi.binary_opening(tower > 0.35, iterations=1)
tower = ndi.binary_closing(tower, structure=np.ones((5, 1)), iterations=2).astype(np.float32)
tower *= np.clip(z_down * 1.3, 0, 1) * (1 - water) * (1 - sky)
tower = ndi.gaussian_filter(tower, 0.6)
cand = rng.random((260000, 2)); cand[:, 1] = 0.135 + cand[:, 1] * (0.50 - 0.135)
shore = np.clip(ndi.gaussian_filter((ndi.binary_dilation(water > 0.5, iterations=int(N * 0.006)) & (water < 0.5)).astype(np.float32), 2) * 2, 0, 1)
for x, y in cand:
    w = at(water, x, y);
    if w > 0.4 or at(sky, x, y) > 0.4: continue
    b = at(built, x, y); dz = at(z_down, x, y); sl = at(z_slu, x, y); pz = at(z_port, x, y); sh = at(shore, x, y)
    pk = at(parks, x, y); vg = at(veg, x, y)
    dens = 0.012 + 0.075 * b + 0.05 * dz + 0.12 * sl + 0.10 * pz + 0.10 * sh
    dens *= (1 - 0.85 * pk) * (1 - 0.45 * vg)
    if rng.random() > dens: continue
    s = s_of(y)
    if dz > 0.4:
        # Owner, 2026-11-22: downtown looked like glitter. Same rng draws as before (so the rest of the city is unchanged),
        # but no point lights on the towers (their windows are drawn per building below), and street level between
        # them is dimmer, warmer and round rather than vertical smears.
        u = rng.random(); col = C['window'] if u < 0.5 else (C['led'] if u < 0.78 else C['sodium'])
        inten = 0.5 + 1.1 * rng.random() * (0.4 + b)
        on_tower = at(tower, x, y) > 0.25
        if not on_tower: add(x, y, col, inten * 0.5, 0.5 * s + 0.28, kind=1)
        if rng.random() < 0.025:
            neon = C[('neon_r', 'neon_t', 'neon_v')[int(rng.random() * 3)]]
            if not on_tower: add(x, y, neon, 1.0, 0.6 * s + 0.35, kind=1)
    elif pz > 0.4:
        add(x, y, C['port'], 0.6 + 0.8 * rng.random(), 0.6 * s + 0.3)
    else:
        u = rng.random()
        if u < 0.55:
            add(x, y, C['window'], (0.28 + 0.55 * rng.random()) * (1.4 if sh > 0.3 else 1.0), 0.6 * s + 0.28, kind=1)
        else:
            add(x, y, C['sodium'] if u > 0.86 else C['led'], (0.30 + 0.55 * rng.random()) * (1.3 if sh > 0.3 else 1.0), 0.6 * s + 0.28)

# ================= 3. Highways and arterials (traced on the photo) =================
I5 = [(-0.01, 0.725), (0.02, 0.70), (0.055, 0.65), (0.09, 0.60), (0.13, 0.55), (0.165, 0.50), (0.215, 0.45),
      (0.25, 0.40), (0.30, 0.355), (0.35, 0.318), (0.385, 0.29), (0.40, 0.262), (0.408, 0.235), (0.415, 0.205), (0.42, 0.18)]
AURORA = [(0.915, 0.372), (0.95, 0.38), (0.98, 0.39), (1.01, 0.398)]
EASTLAKE = [(0.27, 0.505), (0.31, 0.44), (0.35, 0.38), (0.385, 0.33), (0.41, 0.30), (0.43, 0.27)]
# Westlake and Northlake are traced along the line of buildings, inland of the grey marina/haze band that the water
# mask does not catch (owner, 2026-11-22: the old traces ran into the lake). Northlake starts at the foot of Gas Works,
# not out in the bay to its west. East of the park (left in frame) it follows the bay's land side and the north bank of the
# Ship Canal, under the photo's clouds, and passes under I-5 as NE Pacific St (owner, 2026-11-22: it used to end in the water).
WESTLAKE = [(0.522, 0.279), (0.574, 0.288), (0.600, 0.296), (0.628, 0.310), (0.659, 0.338), (0.700, 0.3585), (0.759, 0.377), (0.815, 0.386), (0.870, 0.390), (1.0, 0.394)]
NORTHLAKE = [  # NE Pacific St (left edge, under I-5) <- NE/N Northlake Way around the bay east of Gas Works <- N 34th St (west, right)
    (-0.01, 0.742), (0.040, 0.724), (0.085, 0.708), (0.130, 0.690), (0.175, 0.668), (0.220, 0.652), (0.265, 0.638), (0.310, 0.628),
    (0.350, 0.620), (0.385, 0.613), (0.420, 0.610), (0.450, 0.608), (0.480, 0.603), (0.505, 0.592), (0.520, 0.568), (0.524, 0.545),
    (0.518, 0.522),
    (0.512, 0.503), (0.53, 0.501), (0.56, 0.498), (0.64, 0.494), (0.72, 0.498), (0.80, 0.497), (0.90, 0.494), (1.0, 0.492)]
# No Mercer: a straight trace through South Lake Union to the Needle read as a ruler line (owner, 2026-11-22). The far
# city there is already lit from the photo's own built pixels (section 2).
# Owner, 2026-11-22: Westlake and N 34th St (NORTHLAKE) at half strength. Passed to add() as dim=, which raster()
# applies, so the glint selection and the rng sequence (and so every other light) stay exactly as they were.
ROAD_DIM = {'westlake': 0.5, 'northlake': 0.5}
ROADS = {'i5': I5, 'aurora': AURORA, 'eastlake': EASTLAKE, 'westlake': WESTLAKE, 'northlake': NORTHLAKE}

for (x, y) in polyline_samples(I5, lambda y: 0.006 * s_of(y) + 0.0016):
    s = s_of(y)
    for off in (-0.004, 0.004):
        xo, yo = offset_line([(x, y), (x + 0.01, y - 0.012)], off)[0]
        add(xo, yo, C['sodium'] if (int(y * 900) % 3 == 0) else C['artery'], 1.15, 1.1 * s + 0.35)
for name in ('aurora', 'eastlake', 'westlake', 'northlake'):
    for (x, y) in polyline_samples(ROADS[name], lambda y: 0.007 * s_of(y) + 0.0016):
        if at(water, x, y) > 0.6 and name not in ('aurora',): continue
        add(x, y, C['artery'], 1.35, 1.1 * s_of(y) + 0.3, dim=ROAD_DIM.get(name, 1))

# ================= 4. Landmarks =================
NEEDLE = (0.749, 0.181)
for a in np.linspace(0, 2 * math.pi, 28, endpoint=False):
    add(NEEDLE[0] + math.cos(a) * 0.0042, NEEDLE[1] + math.sin(a) * 0.0011, C['head'], 1.6, 0.5)
for t in np.linspace(0, 1, 10):
    add(NEEDLE[0] + (rng.random() - .5) * 0.002 * t, NEEDLE[1] + 0.003 + t * 0.03, C['window'], 0.5, 0.45)
SHIPS = [(0.712, 0.160), (0.842, 0.133), (0.902, 0.135), (0.585, 0.156)]
for (x, y) in SHIPS:
    for _ in range(4): add(x + (rng.random() - .5) * 0.006, y + (rng.random() - .5) * 0.002, C['head'], 1.0, 0.45)

# ================= rasterise into two layers =================
from scipy.signal import fftconvolve
P = np.array(pts, np.float32)
def raster(sel_kind):
    img = np.zeros((N, N, 3), np.float32)
    Pk = P[P[:, 7] == sel_kind]; r = Pk[:, 5]; bins = [0, 0.5, 0.8, 1.2, 1.7, 2.4, 99]
    for lo, hi in zip(bins[:-1], bins[1:]):
        for el in (1.0, 2.4):
            sel = (r >= lo) & (r < hi) & (np.isclose(Pk[:, 6], el))
            if not sel.any(): continue
            Q = Pk[sel]; imp = np.zeros((N, N, 3), np.float32)
            iy = np.clip((Q[:, 1] * N).astype(int), 0, N - 1); ix = np.clip((Q[:, 0] * N).astype(int), 0, N - 1)
            for c in range(3): np.add.at(imp[..., c], (iy, ix), Q[:, 2 + c] * Q[:, 8])
            sig = max(0.45, 0.5 * (lo + min(hi, 3.0)))
            core = np.stack([ndi.gaussian_filter(imp[..., c], (sig * el, sig)) for c in range(3)], -1) * (2 * math.pi * sig * sig * el) ** -1 * 6
            halo = np.stack([ndi.gaussian_filter(imp[..., c], (sig * 4 * el, sig * 4)) for c in range(3)], -1) * (2 * math.pi * (4 * sig) ** 2 * el) ** -1 * 6 * 0.6
            img += core + halo
    return img

streets = raster(0)
windows = raster(1)

# star glints: the brightest near-field street heads get a faint 6-ray diffraction star (lens aperture)
bright = P[(P[:, 7] == 0) & (P[:, 2:5].max(1) > 3.0) & (P[:, 1] > 0.45)]
bright = bright[(rng.random(len(bright)) < 0.35) & (at(cloud, bright[:, 0], bright[:, 1]) < 0.15)]
K = 41; ky, kx = np.mgrid[-K:K + 1, -K:K + 1].astype(np.float32); rr = np.hypot(kx, ky) + 1e-3; th = np.arctan2(ky, kx)
star = np.zeros_like(rr)
for a in np.radians([18, 78, 138]):
    d = np.abs(np.sin(th - a)) * rr
    star += np.exp(-(d / 0.55) ** 2) * np.exp(-rr / 6.5)
star[K, K] = 0; star /= star.sum()
imp = np.zeros((N, N, 3), np.float32)
iy = np.clip((bright[:, 1] * N).astype(int), 0, N - 1); ix = np.clip((bright[:, 0] * N).astype(int), 0, N - 1)
for c in range(3): np.add.at(imp[..., c], (iy, ix), bright[:, 2 + c] * bright[:, 8] * (0.5 + bright[:, 1]))
glints = np.stack([fftconvolve(imp[..., c], star, mode='same') for c in range(3)], -1) * 2.2
streets += glints

# downtown towers: silhouettes are darker than the haze behind them; fill with floor-striped windows
# The handoff drew these as per-pixel speckle; these draws are kept (unused) so the rng stream, and so the water ripple
# texture below, stay exactly as they were.
_ = rng.random((N, N)); _ = rng.random((N // 6 + 1, N // 6 + 1)); _ = rng.random((N // 9 + 1, N // 9 + 1)); _ = rng.random((N, N)); del _
from scipy.special import ndtr
rt = np.random.default_rng(34)                 # the towers' own stream
# Buildings: connected tower pixels, split into building-width vertical slices (towers that touch in the photo would
# otherwise share floors across the skyline). Each building gets its own occupancy, colour, brightness, floor height and
# floor phase, so floors do not line up from one tower to the next.
lab0, _n0 = ndi.label(tower > 0.3)
cuts = np.cumsum(rt.integers(round(10 * N / 1800), round(26 * N / 1800) + 1, N))   # slice edges along x
slice_of_x = np.searchsorted(cuts, np.arange(N), side='right')
yy_, xx_ = np.mgrid[0:N, 0:N]
key = np.where(lab0 > 0, lab0 * (slice_of_x.max() + 1) + slice_of_x[None, :], 0)
_, lab = np.unique(key, return_inverse=True); lab = lab.reshape(N, N)            # 0 stays 0 (no tower)
nb = int(lab.max())
occ = rt.uniform(0.10, 0.65, nb + 1)            # share of floors lit
fill = rt.uniform(0.45, 0.85, nb + 1)           # share of windows lit along a lit floor
kind_b = rt.random(nb + 1)                      # light colour family
gain = rt.uniform(0.5, 1.0, nb + 1)
fh_b = rt.choice(np.array([2, 3, 3, 4]) * N // 1800 if N >= 1800 else np.array([2, 2, 3, 3]), nb + 1)
ph_b = rt.integers(0, 4, nb + 1)
fhp, php = fh_b[lab], ph_b[lab]
fi = (yy_ + php) // fhp                         # floor index within each building
nf = N // 2 + 2
fz = ndi.gaussian_filter1d(rt.standard_normal((nf, nb + 1)), 1.3, axis=0); fz /= fz.std(axis=0, keepdims=True) + 1e-6
floor_lit = ndtr(fz) < occ[None, :]             # whole floors on or off, in vertical runs
wz = ndi.gaussian_filter1d(rt.standard_normal((nf, N)), 1.2, axis=1); wz /= wz.std() + 1e-6
win_lit = ndtr(wz[fi, xx_]) < fill[lab]         # windows along a floor, in runs
lit = (lab > 0) & floor_lit[fi, lab] & win_lit & ((yy_ + php) % fhp != 0) & (xx_ % 2 == 0)   # slab row; mullions
fam = kind_b[lab]
tcol = np.where((fam < 0.6)[..., None], C['office'], np.where((fam < 0.85)[..., None], C['window'], C['led']))
tint = 0.8 + 0.4 * rt.random((nf, nb + 1))[fi, lab]
tower_em = lit[..., None] * tcol * ((tower ** 1.2) * gain[lab] * tint)[..., None]
tower_em = np.stack([ndi.gaussian_filter(tower_em[..., c], 0.45) for c in range(3)], -1)
windows += tower_em * 1.1
print('downtown towers', nb)
# tower crowns stay lit all night (architectural lighting) -> street layer
crown = tower * (ndi.binary_erosion(tower > 0.3, structure=np.ones((4, 1))) == 0) * (tower > 0.3)
streets += np.stack([ndi.gaussian_filter(crown.astype(np.float32), 0.8)] * 3, -1) * C['office'] * 0.35

# traffic streaks baked faintly along I-5 (animated cars ride on top in the page)
streak = np.zeros((N, N, 3), np.float32)
for off, col in ((-0.0025, C['head']), (0.0025, C['tail'])):
    for (x, y) in polyline_samples(offset_line(I5, off), lambda y: 0.0008):
        iy, ix = int(y * N), int(x * N)
        if 0 <= iy < N and 0 <= ix < N: streak[iy, ix] += col * 0.22
streets += np.stack([ndi.gaussian_filter(streak[..., c], 0.8) for c in range(3)], -1) * 0.9

YY = np.mgrid[0:N, 0:N][0] / N
cl2 = np.clip(cloud * 1.2, 0, 1) * (1 - water) + cloud * water * 0.3
cl2 *= np.clip((YY - 0.17) / 0.06, 0, 1) * (1 - np.clip(z_down * 1.5, 0, 1))
cl = cl2[..., None]
hz = np.clip((0.30 - YY) / 0.16, 0, 1)[..., None]
ripple = ndi.gaussian_filter(rng.random((N, N)).astype(np.float32), (0.7, 5)); ripple = np.clip((ripple - ripple.mean()) / ripple.std() * 0.35 + 0.65, 0, 1.4)
klen = int(N * 0.028); ker = np.exp(-np.arange(klen) / (klen * 0.35)); ker /= ker.sum(); ker = np.concatenate([np.zeros(klen - 1), ker])
def blur3(a, s): return np.stack([ndi.gaussian_filter(a[..., c], s) for c in range(3)], -1)
def finish(img):
    img = img + blur3(img, N * 0.004) * (0.25 + 0.9 * albedo)[..., None] * ((1 - sky) * (1 - water))[..., None]   # spill
    img = img * (1 - 0.85 * cl) + blur3(img, N * 0.012) * cl * 2.2                                            # through cloud
    img = img * (1 - 0.35 * hz) + blur3(img, 1.6) * 0.35 * hz                                                  # far haze
    img = img + blur3(img, N * 0.03) * cl * 0.55 * np.array([1.0, 0.8, 0.62])                                  # cloud glow
    refl = np.stack([ndi.convolve1d(img[..., c], ker, axis=0, mode='constant') for c in range(3)], -1)
    img = img * (1 - water[..., None]) + refl * water[..., None] * 0.45 * ripple[..., None]   # was 0.9: long bright streaks read as roads into the lake
    return img * (1 - sky[..., None] * 0.9)
def tone(img): return np.clip(1 - np.exp(-img * 1.05), 0, 1)
def save(name, a, q=86):
    im = Image.fromarray((a ** (1 / 1.15) * 255).astype(np.uint8)); im.save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)
    im.save(os.path.join(OUT, name[:-4] + '.png'))  # lossless master

S = tone(finish(streets)); Wn = tone(finish(windows))
save('streets.jpg', S); save('windows.jpg', Wn)
both = 1 - (1 - S) * (1 - Wn)
save('lights.jpg', both)
bloom = blur3(both, N * 0.009)
Image.fromarray((np.clip(bloom * 1.8, 0, 1) * 255).astype(np.uint8)).resize((480, 480), Image.LANCZOS).save(os.path.join(OUT, 'bloom.jpg'), quality=82, optimize=True)
# alpha mask of where the city light is: used to light falling rain from below at night
lm = np.clip(blur3(both, N * 0.006).max(-1) * 2.6, 0, 1) ** 0.8
lmI = Image.fromarray((lm * 255).astype(np.uint8)).resize((600, 600), Image.LANCZOS)
im = Image.new('RGBA', (600, 600), (255, 255, 255, 0)); im.putalpha(lmI); im.save(os.path.join(OUT, 'lightmask_a.png'), optimize=True)

# ================= linework: an optional drawn style ("lantern map") =================
from PIL import ImageDraw
SS = 2; LW = Image.new('RGB', (N * SS, N * SS), (0, 0, 0)); dr = ImageDraw.Draw(LW)
def P2(x, y): return (x * N * SS, y * N * SS)
def seg(a, b, col, w):
    xm, ym = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    if at(water, xm, ym) > 0.3 or at(parks, xm, ym) > 0.5 or not (0 <= xm <= 1 and 0 <= ym <= 1): return
    s = s_of(ym); dr.line([P2(*a), P2(*b)], fill=tuple(int(v) for v in col), width=max(1, int(round(w * SS * (0.35 + 0.9 * s)))))
amber, gold, teal, white = (150, 92, 38), (235, 165, 70), (60, 190, 200), (230, 220, 200)
ART = dict(ROADS)
ART['n45'] = [(x, ew_y(row_45th, x)) for x in np.linspace(0.30, 1.0, 40)]
ART['n40'] = [(x, ew_y(row_40th, x)) for x in np.linspace(0.47, 1.0, 40)]
ART['av1'] = [(ns_x(col_wall, y), y) for y in np.linspace(0.50, 1.0, 30)]
ART['av2'] = [(ns_x(col_b, y), y) for y in np.linspace(0.50, 1.0, 30)]
for name, P_ in ART.items():
    for a, b in zip(P_[:-1], P_[1:]):
        for t0 in np.linspace(0, 1, 8)[:-1]:
            t1 = t0 + 1 / 7
            aa = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0); bb = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
            ym = (aa[1] + bb[1]) / 2; s = s_of(ym)
            if name not in ('i5', 'aurora') and at(water, (aa[0] + bb[0]) / 2, ym) > 0.3: continue
            col = white if name in ('i5', 'aurora') else gold
            dr.line([P2(*aa), P2(*bb)], fill=col, width=max(1, int(round((1.6 if name in ('i5', 'aurora') else 1.1) * SS * (0.3 + 0.9 * s)))))
LWa = np.asarray(LW.resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
edge = (ndi.binary_dilation(water > 0.5, iterations=2) & ~ndi.binary_erosion(water > 0.5, iterations=1)).astype(np.float32)
edge = ndi.gaussian_filter(edge, 0.7) * (1 - sky)
YYe, XXe = np.mgrid[0:N, 0:N] / N
edge *= (YYe > 0.168) & (XXe > 0.006) & (XXe < 0.994) & (YYe < 0.994)       # real shorelines only, not mask borders
edge *= ~((YYe < 0.24) & (XXe < 0.06))                                          # Lake Washington slivers are mask boxes
LWa += edge[..., None] * np.array(teal) / 255 * 0.55
LWa = LWa * (1 - np.clip(cloud * 1.3, 0, 1) * 0.75)[..., None] * 0.8
LWa = LWa + blur3(LWa, 2.0) * 0.9 + blur3(LWa, 8) * 0.5
save('linework.jpg', np.clip(LWa, 0, 1), q=84)
print('points', len(pts), 'streets', int((P[:, 7] == 0).sum()), 'windows', int((P[:, 7] == 1).sum()), 'glints', len(bright))
