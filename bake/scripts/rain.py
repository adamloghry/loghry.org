"""Rain textures (white + alpha, seamlessly tiling in both axes).

Three depth layers, so rain reads as a volume instead of a ruled pattern:
  rain_far.png   dense, short, faint streaks (distant)    256x256
  rain_mid.png   medium                                    384x384
  rain_near.png  sparse, long, soft, slightly brighter     512x512
Each streak: random length, width and brightness, tapered at both ends
(motion blur of a falling drop), with a small angle jitter around the wind.
Plus rain_veil.png: drifting curtains (vertical-streaked fbm), tiles in x.
"""
import numpy as np, os, math
from PIL import Image
from scipy import ndimage as ndi
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
rng = np.random.default_rng(42)

def streaks(size, n, Lr, Wr, Ar, jitter_deg, blur, seed):
    r = np.random.default_rng(seed); SS = 3; S = size * SS
    acc = np.zeros((S, S), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for _ in range(n):
        L = r.uniform(*Lr) * SS; w = r.uniform(*Wr) * SS; a = r.uniform(*Ar)
        ang = math.radians(r.normal(0, jitter_deg))            # 0 = vertical; wind tilt is applied by the page
        cx, cy = r.uniform(0, S), r.uniform(0, S)
        dx, dy = math.sin(ang), math.cos(ang)
        # bounding box (with wrap copies)
        half = L / 2 + 2 * w + 2
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                x0, x1 = int(max(0, cx + ox - half)), int(min(S, cx + ox + half))
                y0, y1 = int(max(0, cy + oy - half)), int(min(S, cy + oy + half))
                if x0 >= x1 or y0 >= y1: continue
                X = xx[y0:y1, x0:x1] - (cx + ox); Y = yy[y0:y1, x0:x1] - (cy + oy)
                t = X * dx + Y * dy; d = np.abs(X * dy - Y * dx)
                prof = np.clip(1 - (2 * t / L) ** 2, 0, 1) ** 0.8          # taper along the streak
                acc[y0:y1, x0:x1] += a * prof * np.exp(-(d / (0.5 * w)) ** 2)
    acc = acc.reshape(size, SS, size, SS).mean((1, 3))
    if blur: acc = ndi.gaussian_filter(acc, blur, mode='wrap')
    return np.clip(acc, 0, 1)

def save(name, a):
    im = Image.new('RGBA', a.shape[::-1], (255, 255, 255, 0)); im.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    im.save(os.path.join(OUT, name), optimize=True)

save('rain_far.png', streaks(256, 140, (6, 14), (0.6, 0.9), (0.25, 0.55), 2.5, 0.25, 1))
save('rain_mid.png', streaks(384, 70, (16, 34), (0.8, 1.3), (0.30, 0.70), 2.0, 0.35, 2))
save('rain_near.png', streaks(512, 22, (50, 110), (1.4, 2.4), (0.35, 0.75), 1.5, 0.9, 3))

# rain veils: curtains of heavier rain drifting across, streaked vertically, tile in x
w, h = 1024, 512
def fbm_tile(w, h, octaves, seed, sx=1, sy=1):
    r = np.random.default_rng(seed); acc = np.zeros((h, w)); amp = 1; tot = 0
    for o in range(octaves):
        gx = max(2, int(2 ** (o + 2) * sx)); gy = max(2, int(2 ** (o + 2) * sy))
        g = r.random((gy, gx)); t = np.tile(g, (1, 3))
        big = np.asarray(Image.fromarray((t * 255).astype(np.uint8)).resize((3 * w, h), Image.BICUBIC)) / 255
        acc += amp * big[:, w:2 * w]; tot += amp; amp *= 0.55
    return acc / tot
base = fbm_tile(w, h, 6, 9, sx=1.0, sy=0.25)               # stretched vertically -> shafts
v = np.clip((base - 0.45) / 0.25, 0, 1) ** 1.3
vy = np.mgrid[0:h, 0:w][0] / h
v *= np.clip(1 - np.abs(vy - 0.5) / 0.5, 0, 1) ** 0.5
save('rain_veil.png', v)
print('rain ok')
