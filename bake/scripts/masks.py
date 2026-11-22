"""Derive geography masks from the aerial photo (camera north of Lake Union, looking south).

Outputs (float32 .npy at N x N, values 0..1) into bake/scripts/out/:
  water, sky, veg, built, cloud, zone_* and a debug overlay JPEG.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
import os, sys

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1800
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
src = Image.open(os.path.join(HERE, '..', 'original.png')).convert('RGB').resize((N, N), Image.LANCZOS)
a = np.asarray(src).astype(np.float32) / 255.0
R, G, B = a[..., 0], a[..., 1], a[..., 2]
L = 0.2126 * R + 0.7152 * G + 0.0722 * B
yy, xx = np.mgrid[0:N, 0:N] / float(N)

def poly(points, blur=0):
    im = Image.new('L', (N, N), 0)
    ImageDraw.Draw(im).polygon([(x * N, y * N) for x, y in points], fill=255)
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur * N))
    return np.asarray(im).astype(np.float32) / 255.0

# local texture: std of luminance in a small window
k = max(3, N // 120)
mu = ndi.uniform_filter(L, k); mu2 = ndi.uniform_filter(L * L, k)
std = np.sqrt(np.clip(mu2 - mu * mu, 0, None))
sat = a.max(-1) - a.min(-1)

# --- sky: everything above the hazy far shore; hand-traced horizon (photo is fixed) ---
sky = poly([(0, 0), (1, 0), (1, 0.105), (0.9, 0.095), (0.8, 0.10), (0.7, 0.105), (0.62, 0.115),
            (0.55, 0.125), (0.45, 0.13), (0.35, 0.135), (0.25, 0.14), (0.12, 0.15), (0, 0.155)], blur=0.006)

# --- water: smooth + low saturation, restricted to hand-drawn candidate regions so roofs/roads never count ---
cand = np.zeros((N, N), np.float32)
# Lake Union main body + arm west toward Fremont
cand = np.maximum(cand, poly([(0.40, 0.30), (0.52, 0.275), (0.60, 0.30), (0.66, 0.345), (0.74, 0.385),
                              (0.85, 0.395), (1.0, 0.40), (1.0, 0.49), (0.80, 0.475), (0.66, 0.47),
                              (0.60, 0.455), (0.52, 0.455), (0.47, 0.49), (0.44, 0.53), (0.40, 0.58),
                              (0.33, 0.58), (0.30, 0.55), (0.36, 0.48), (0.41, 0.40)]))
# Elliott Bay + Duwamish mouth
cand = np.maximum(cand, poly([(0.53, 0.14), (0.62, 0.118), (0.80, 0.112), (1.0, 0.105), (1.0, 0.195),
                              (0.85, 0.19), (0.70, 0.19), (0.62, 0.19), (0.56, 0.18)]))
# Lake Washington slivers (far left) and Ship Canal / Portage Bay under the I-5 bridge
cand = np.maximum(cand, poly([(0.0, 0.16), (0.06, 0.16), (0.06, 0.185), (0.0, 0.19)]))
cand = np.maximum(cand, poly([(0.0, 0.195), (0.05, 0.198), (0.04, 0.23), (0.0, 0.235)]))

smooth = (std < 0.035) & (sat < 0.16)
smooth = ndi.binary_opening(smooth, iterations=1)
smooth = ndi.binary_closing(smooth, iterations=3)
water = (smooth & (cand > 0.5)).astype(np.float32)
# drop tiny fragments
lab, n = ndi.label(water > 0.5)
if n:
    sizes = ndi.sum(water > 0.5, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.where(sizes > (N * N) * 0.0004)[0])
    water = keep.astype(np.float32)
water = ndi.binary_fill_holes(water > 0.5).astype(np.float32)

# --- baked clouds (bright, smooth, low sat) outside sky ---
cloud = ((L > 0.66) & (std < 0.05) & (sat < 0.10)).astype(np.float32)
cloud = ndi.binary_opening(cloud > 0.5, iterations=2).astype(np.float32)
cloud = ndi.gaussian_filter(cloud, N / 300) * (1 - sky)
cloud = np.clip(cloud * 1.4, 0, 1)
# soft cloud density from brightness (for thin edges)
cloud_soft = np.clip((L - 0.45) / 0.35, 0, 1) * np.clip(1 - std / 0.06, 0, 1)
cloud_soft = ndi.gaussian_filter(cloud_soft, N / 250) * (1 - sky) * (1 - water)
cloud = np.maximum(cloud, np.clip(cloud_soft * 1.2 - 0.15, 0, 1))
# water is never cloud-free under the big baked cloud, but its luminance test already handles it.

# --- vegetation: green dominance or very dark tree canopy ---
exg = G - 0.5 * (R + B)
veg = np.clip((exg + 0.005) / 0.05, 0, 1)
veg = np.maximum(veg, np.clip((0.20 - L) / 0.10, 0, 1) * 0.6)
veg = ndi.gaussian_filter(veg, 1.0)

# --- built: textured, non-veg, non-water, non-sky ---
built = np.clip(std / 0.06, 0, 1) * (1 - veg) * (1 - water) * (1 - sky)
built = np.clip(built * (1 - 0.8 * np.clip(cloud * 1.5, 0, 1)), 0, 1)

# --- hand-drawn parks (dark at night) ---
parks = np.zeros((N, N), np.float32)
parks = np.maximum(parks, poly([(0.50, 0.458), (0.56, 0.452), (0.62, 0.455), (0.64, 0.47), (0.62, 0.492),
                                (0.55, 0.495), (0.51, 0.49)], blur=0.004))     # Gas Works Park
parks = np.maximum(parks, poly([(0.80, 0.885), (0.86, 0.875), (0.95, 0.92), (1.0, 0.93), (1.0, 1.0),
                                (0.83, 1.0)], blur=0.006))                       # playfield south of Lincoln HS
parks = np.maximum(parks, poly([(0.08, 0.285), (0.20, 0.29), (0.27, 0.31), (0.25, 0.345), (0.12, 0.36),
                                (0.05, 0.35)], blur=0.01))                       # Capitol Hill north-slope greenbelt

# --- zones (light character) ---
zones = {
    'downtown': poly([(0.415, 0.145), (0.47, 0.14), (0.53, 0.155), (0.60, 0.165), (0.665, 0.172),
                      (0.665, 0.235), (0.55, 0.25), (0.46, 0.245), (0.42, 0.22)], blur=0.008),
    'slu': poly([(0.45, 0.24), (0.60, 0.235), (0.68, 0.24), (0.66, 0.30), (0.56, 0.285), (0.46, 0.29)], blur=0.012),
    'port': poly([(0.42, 0.10), (0.62, 0.115), (0.55, 0.15), (0.45, 0.14)], blur=0.01),
}
np.save(os.path.join(OUT, 'water.npy'), water.astype(np.float32))
np.save(os.path.join(OUT, 'sky.npy'), sky.astype(np.float32))
np.save(os.path.join(OUT, 'cloud.npy'), cloud.astype(np.float32))
np.save(os.path.join(OUT, 'veg.npy'), veg.astype(np.float32))
np.save(os.path.join(OUT, 'built.npy'), built.astype(np.float32))
np.save(os.path.join(OUT, 'parks.npy'), parks.astype(np.float32))
for k2, v in zones.items(): np.save(os.path.join(OUT, 'zone_%s.npy' % k2), v)

dbg = a.copy() * 0.55
dbg[..., 2] += water * 0.45
dbg[..., 0] += sky * 0.35
dbg[..., 1] += veg * 0.25
dbg[..., 0] += cloud * 0.35; dbg[..., 1] += cloud * 0.35
dbg[..., 0] += parks * 0.4
Image.fromarray((np.clip(dbg, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, 'debug_masks.jpg'), quality=80)
print('ok', N)
