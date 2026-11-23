"""Extra baked layers: water / foliage / snow masks, stars, water textures, snow flakes,
holiday lights, plus WebP versions of the heavy plates. All static files."""
import numpy as np, os, math
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
M = lambda n: np.load(os.path.join(OUT, n + '.npy'))
water, sky, cloud, veg, built, parks = (M(k) for k in ('water', 'sky', 'cloud', 'veg', 'built', 'parks'))
N = water.shape[0]
ph = np.asarray(Image.open(os.path.join(HERE, '..', 'original.png')).convert('RGB').resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
Lg = ph.mean(-1)
rng = np.random.default_rng(77)

def save_alpha(name, a, size=None, q=82):
    a = np.clip(a, 0, 1); im = Image.fromarray((a * 255).astype(np.uint8))
    if size: im = im.resize(size, Image.LANCZOS)
    rgba = Image.new('RGBA', im.size, (255, 255, 255, 0)); rgba.putalpha(im)
    rgba.save(os.path.join(OUT, name), 'WEBP', quality=q, alpha_quality=q, method=6)

# water (Lake Union + Elliott Bay), feathered a touch inward so effects never spill onto docks
w = ndi.gaussian_filter(ndi.binary_erosion(water > 0.5, iterations=2).astype(np.float32), 1.5)
save_alpha('water_a.webp', w * (1 - np.clip(cloud * 1.4, 0, 1)), (800, 800))
lake = w.copy(); lake[: int(0.24 * N)] = 0                      # Lake Union only (no Elliott Bay)
save_alpha('lake_a.webp', lake, (800, 800))
# clear of the photo's own clouds: moving traffic is masked by it, so cars never float over a baked cloud (owner, 2026-11-23)
save_alpha('clear_a.webp', 1 - np.clip(ndi.gaussian_filter(cloud, 2.0) * 1.6, 0, 1), (900, 900))

# deciduous-ish foliage: vegetation that is not the darkest conifer canopy
nearw = ndi.binary_dilation(water > 0.3, iterations=int(N * 0.006)).astype(np.float32)
yy_, xx_ = np.mgrid[0:N, 0:N] / N
lawn = ((xx_ > 0.49) & (xx_ < 0.65) & (yy_ > 0.445) & (yy_ < 0.50)).astype(np.float32)        # Gas Works is grass, not canopy
exg = ph[..., 1] - 0.5 * (ph[..., 0] + ph[..., 2])
dec = np.clip((exg - 0.012) / 0.05, 0, 1) * np.clip((Lg - 0.15) / 0.14, 0, 1) * (1 - nearw) * (1 - lawn) * (1 - sky) * (1 - np.clip(cloud * 1.6, 0, 1))
dec = ndi.gaussian_filter(dec, 1.2)
save_alpha('foliage_a.webp', np.clip(dec * 1.25, 0, 1), (1000, 1000), q=70)

# snow cover: roofs, lawns and quiet streets take it; water never; thinner under the photo's clouds
n1 = ndi.zoom(rng.random((N // 40 + 1, N // 40 + 1)), 40, order=1)[:N, :N]
# snow sits on roofs and open ground (bright, flat surfaces); dark canopy and street canyons show through
flat = np.clip((Lg - 0.20) / 0.30, 0, 1)
snow = (1 - water) * (1 - sky) * (0.16 + 0.84 * flat ** 0.8) * (0.85 + 0.15 * n1) * (1 - 0.6 * np.clip(cloud, 0, 1))
save_alpha('snow_a.webp', ndi.gaussian_filter(snow, 0.9), (900, 900), q=48)

# stars: only inside the sky strip at the top of the frame
SW, SH = 1440, 200
st = np.zeros((SH, SW), np.float32)
skys = np.asarray(Image.fromarray((sky * 255).astype(np.uint8)).resize((1440, 1440), Image.LANCZOS))[:SH] / 255.0
for _ in range(420):
    x, y = rng.integers(0, SW), rng.integers(0, SH)
    st[y, x] += rng.random() ** 2.2 * 1.4 + 0.25
st = ndi.gaussian_filter(st, 0.55) * 3.2 * np.clip((skys - 0.6) / 0.4, 0, 1)
save_alpha('stars_a.webp', st, q=90)

def tile_noise(w, h, gx, gy, seed):
    r = np.random.default_rng(seed); g = r.random((gy, gx)); t = np.tile(g, (3, 3))
    big = np.asarray(Image.fromarray((t * 255).astype(np.uint8)).resize((3 * w, 3 * h), Image.BICUBIC)) / 255.0
    return big[h:2 * h, w:2 * w]

# wind ripples: long horizontal streaks (the camera looks along the lake, so ripples read as flat dashes)
rp = sum(tile_noise(512, 256, gx, gy, 5 + i) * a for i, (gx, gy, a) in enumerate(((16, 32, 1), (32, 64, .6), (64, 128, .35))))
rp = np.clip((rp / 1.95 - 0.56) / 0.16, 0, 1) ** 1.3
save_alpha('ripple_a.webp', rp)
# glitter: denser, shorter dashes
gl = sum(tile_noise(256, 128, gx, gy, 15 + i) * a for i, (gx, gy, a) in enumerate(((32, 64, 1), (64, 128, .7))))
gl = np.clip((gl / 1.7 - 0.55) / 0.12, 0, 1)
save_alpha('glitter_a.webp', gl)

# rain rings on water: flattened ellipses (perspective), a few sizes
def rings(size, n, seed):
    r = np.random.default_rng(seed); S = size * 3; acc = np.zeros((S, S), np.float32); yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for _ in range(n):
        cx, cy = r.uniform(0, S), r.uniform(0, S); rx = r.uniform(5, 14) * 1.5; ry = rx * 0.34; a = r.uniform(.4, 1)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                x0, x1, y0, y1 = int(max(0, cx + ox - rx - 4)), int(min(S, cx + ox + rx + 4)), int(max(0, cy + oy - ry - 4)), int(min(S, cy + oy + ry + 4))
                if x0 >= x1 or y0 >= y1: continue
                d = np.sqrt(((xx[y0:y1, x0:x1] - cx - ox) / rx) ** 2 + ((yy[y0:y1, x0:x1] - cy - oy) / ry) ** 2)
                acc[y0:y1, x0:x1] += a * np.exp(-((d - 1) / 0.16) ** 2)
    return np.clip(acc.reshape(size, 3, size, 3).mean((1, 3)), 0, 1)
save_alpha('rings1_a.webp', rings(256, 46, 1)); save_alpha('rings2_a.webp', rings(256, 46, 2))

# snow flakes (soft dots, three sizes), tiling
def flakes(size, n, seed):
    r = np.random.default_rng(seed); a = np.zeros((size * 2, size * 2), np.float32)
    for _ in range(n):
        x, y = r.integers(0, size * 2), r.integers(0, size * 2); a[y, x] += r.choice([1.5, 3, 6], p=[.6, .3, .1])
    a = ndi.gaussian_filter(a, 1.3, mode='wrap') * 5
    return np.clip(a.reshape(size, 2, size, 2).mean((1, 3)), 0, 1)
save_alpha('flakes_a.webp', flakes(256, 150, 3))

# holiday lights: coloured points on houses, houseboats and along the shore
cols = np.array([[1, .15, .12], [.15, 1, .3], [.2, .45, 1], [1, .75, .2], [1, 1, .9]], np.float32)
hol = np.zeros((N, N, 3), np.float32); cnt = 0
shore = ndi.binary_dilation(water > 0.5, iterations=int(N * 0.005)) & (water < 0.5)
while cnt < 1900:
    x, y = rng.integers(0, N), rng.integers(int(0.2 * N), N)
    p = built[y, x] * 0.5 + (0.9 if shore[y, x] else 0)
    if water[y, x] > 0.3 or parks[y, x] > 0.5 or cloud[y, x] > 0.4 or rng.random() > p: continue
    k = 3 if rng.random() < 0.7 else 1
    c = cols[rng.integers(0, 5)]
    for _ in range(k):                                  # short strings along a roofline
        xx_, yy_ = min(N - 1, x + rng.integers(-3, 4)), min(N - 1, y + rng.integers(-1, 2)); hol[yy_, xx_] += c * (0.8 + 0.6 * y / N)
    cnt += 1
hol = np.stack([ndi.gaussian_filter(hol[..., c], 0.8) for c in range(3)], -1) * 5.5
hol += np.stack([ndi.gaussian_filter(hol[..., c], 3) for c in range(3)], -1) * 0.8
_h = Image.fromarray((np.clip(1 - np.exp(-hol), 0, 1) * 255).astype(np.uint8)); _h.save(os.path.join(OUT, 'holiday.webp'), 'WEBP', quality=82, method=6); _h.save(os.path.join(OUT, 'holiday.avif'), 'AVIF', quality=52, speed=4)

import sys
if '--masks-only' in sys.argv: print('masks ok'); sys.exit()
# WebP (and AVIF for the full-frame photos) from the lossless masters
def master(n): p = os.path.join(OUT, n + '.png'); return Image.open(p if os.path.exists(p) else os.path.join(OUT, n + '.jpg'))
for n, q in (('plate_day', 80), ('plate_golden_am', 80), ('plate_golden_pm', 80), ('plate_blue', 80), ('linework', 82), ('bloom', 80)):
    master(n).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=q, method=6)
for n in ('plate_day', 'plate_golden_am', 'plate_golden_pm', 'plate_blue'):
    master(n).save(os.path.join(OUT, n + '.avif'), 'AVIF', quality=58, speed=4)
# fog as white with the mask in alpha
_f = Image.open(os.path.join(OUT, 'fog.png')).convert('L').resize((600, 600), Image.LANCZOS); _fa = Image.new('RGBA', (600, 600), (255, 255, 255, 0)); _fa.putalpha(_f); _fa.save(os.path.join(OUT, 'fog_a.png'), optimize=True)
STATIC = os.path.join(HERE, '..', 'static')
for n in ('fog_a', 'rain_far', 'rain_mid', 'rain_near', 'rain_veil'):
    Image.open(os.path.join(OUT, n + '.png')).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=82, alpha_quality=85, method=6)
for n in ('cloud1_t', 'cloud2_t'):
    Image.open(os.path.join(STATIC, n + '.png')).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=82, alpha_quality=85, method=6)
print('extras ok')
