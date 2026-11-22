"""Grade the aerial photo into five time-of-day plates (no CSS filters at runtime).

Looking south: sunrise light comes from the left of frame, sunset from the right.
Plates: day, golden_am, golden_pm, blue (civil twilight), night.
Also bakes a fog density map (fog pools on the lake and Ship Canal, thins on hills)
and two drifting cloud sprites.
"""
import numpy as np, os, sys
from PIL import Image
from scipy import ndimage as ndi

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1800
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
M = lambda n: np.load(os.path.join(OUT, n + '.npy'))
water, sky, cloud, veg = M('water'), M('sky'), M('cloud'), M('veg')
ph = np.asarray(Image.open(os.path.join(HERE, '..', 'original.png')).convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
yy, xx = np.mgrid[0:N, 0:N] / float(N)
lin = ph ** 2.2                                   # work in (approximately) linear light
lum = (lin * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
W, S, CL = water[..., None], sky[..., None], np.clip(cloud, 0, 1)[..., None]
def sat(x, k): l = (x * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True); return l + (x - l) * k
def save(name, x, q=80):
    x = np.clip(x, 0, 1) ** (1 / 2.2)
    im = Image.fromarray((x * 255 + 0.5).astype(np.uint8)); im.save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)
    im.save(os.path.join(OUT, name[:-4] + '.png'))  # lossless master: WebP and AVIF are encoded from this, not from the JPEG
def grad(top, bottom, y0=0.0, y1=0.16):
    t = np.clip((yy - y0) / (y1 - y0), 0, 1)[..., None]
    return np.array(top) * (1 - t) + np.array(bottom) * t
haze_texture = np.clip(ndi.gaussian_filter(lum[..., 0], 3) / max(1e-4, lum[..., 0][sky > 0.5].mean()), 0.6, 1.4)[..., None]

# ---- day: the photo, gently neutralised (it was shot through an Instagram-style warm filter) ----
day = sat(lin, 1.06) * [0.97, 1.0, 1.04]
day = (day - 0.012) * 1.04
save('plate_day.jpg', day)

# ---- golden: low sun, warm key from one side, cool shadows, sky warm toward the sun ----
def golden(side):
    sunx = 1.0 if side == 'pm' else 0.0
    toward = np.clip(1 - np.abs(xx - sunx), 0, 1)[..., None] ** 1.6
    g = sat(lin, 1.15)
    hi = np.clip(lum * 3, 0, 1)
    g = g * (hi * np.array([1.18, 0.98, 0.72]) + (1 - hi) * np.array([0.82, 0.88, 1.04]))
    g = g * (0.78 + 0.32 * toward)
    g += toward * np.array([0.10, 0.045, 0.0]) * (1 - W) * (1 - S)
    skyc = grad([0.55, 0.62, 0.78], [1.0, 0.72, 0.45], 0.0, 0.15) * (0.75 + 0.45 * toward) * haze_texture ** 0.5
    g = g * (1 - S) + skyc * S
    g = g * (1 - W) + (g * 0.62 + np.array([0.11, 0.075, 0.05]) * (0.5 + 0.8 * toward)) * W
    g = g * (1 - CL * 0.4) + CL * 0.4 * np.array([1.0, 0.78, 0.58]) * (0.55 + 0.5 * toward)
    return g * 0.92
save('plate_golden_pm.jpg', golden('pm')); save('plate_golden_am.jpg', golden('am'))

# ---- blue hour: ~ -4 deg sun; land in cool shadow, water mirrors a bright sky ----
b = sat(lin, 0.62) * np.array([0.30, 0.37, 0.58])
skyb = grad([0.10, 0.15, 0.34], [0.58, 0.44, 0.52], 0.0, 0.15) * haze_texture ** 0.4
b = b * (1 - S) + skyb * S
b = b * (1 - W) + (b * 0.55 + np.array([0.075, 0.085, 0.16])) * W
b = b * (1 - CL * 0.5) + CL * 0.5 * np.array([0.34, 0.34, 0.46])
save('plate_blue.jpg', b)

# ---- night: scotopic shift (blue, desaturated, crushed), sky near-black with haze ----
n = sat(lin ** 1.25, 0.25) * np.array([0.046, 0.058, 0.098])
n = n + 0.004
skyn = grad([0.012, 0.016, 0.034], [0.050, 0.046, 0.058], 0.0, 0.15) * haze_texture ** 0.3
n = n * (1 - S) + skyn * S
n = n * (1 - W) + (n * 0.45 + np.array([0.010, 0.013, 0.024])) * W
n = n * (1 - CL * 0.6) + CL * 0.6 * np.array([0.045, 0.046, 0.058])
save('plate_night.jpg', n, q=82)

# ---- fog density: pools over water and low ground near the lake, thins uphill/inland ----
near_water = ndi.gaussian_filter(water, N * 0.03)
low = np.clip((yy - 0.25) / 0.3, 0, 1) * np.clip((0.75 - yy) / 0.25, 0, 1)     # lake basin band
rng = np.random.default_rng(7)
def fbm(size, octaves=5, seed=0):
    r = np.random.default_rng(seed); acc = np.zeros((size, size)); amp = 1; tot = 0
    for o in range(octaves):
        g = 2 ** (o + 2); base = r.random((g, g))
        acc += amp * np.asarray(Image.fromarray((base * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)) / 255
        tot += amp; amp *= 0.55
    return acc / tot
F = 600
nw = np.asarray(Image.fromarray((np.clip(near_water, 0, 1) * 255).astype(np.uint8)).resize((F, F))) / 255
lw = np.asarray(Image.fromarray((low * 255).astype(np.uint8)).resize((F, F))) / 255
fy = np.mgrid[0:F, 0:F][0] / F
dist = np.clip((0.45 - fy) / 0.3, 0, 1)                                  # far city always hazier
fog = np.clip(0.15 + 1.6 * nw + 0.35 * lw + 0.55 * dist, 0, 1) * (0.55 + 0.6 * fbm(F, 5, 3))
fog = np.clip(fog, 0, 1)
Image.fromarray((fog * 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'fog.png'), optimize=True)

# ---- cloud sprites: tileable horizontally, alpha only ----
for i, seed in enumerate((11, 23)):
    w, h = 1024, 512
    base = fbm(1024, 6, seed)[:h, :w]
    base = (base + np.roll(base, w // 2, axis=1)) / 2
    v = np.clip((base - (0.50 if i == 0 else 0.53)) / 0.22, 0, 1) ** 1.4
    vy = np.mgrid[0:h, 0:w][0] / h
    v *= np.clip(1 - np.abs(vy - 0.5) / 0.5, 0, 1) ** 0.7
    Image.fromarray((v * 255).astype(np.uint8), 'L').save(os.path.join(OUT, 'cloud%d.png' % (i + 1)), optimize=True)
print('plates ok')
