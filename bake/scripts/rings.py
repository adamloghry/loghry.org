"""Rain rings on the water: two alternating frames (ringsw1, ringsw2) of tiny ripples, for the rain layer.

The handoff's rings were hand-made (33 rings, 7-27 px wide at 1080 px) and their generator was lost; from ~1 km up they
read as stones dropped in the lake (owner, 2026-11-22: "much smaller, not correctly proportioned"). Here: many rings a
couple of pixels across and faint (too busy otherwise), flattened and shrunk by perspective like everything else on the ground plane, scattered over
the water mask. Output: out/ringsw1.webp, out/ringsw2.webp (1080 x 1080, white on transparent), installed by install.py.
"""
import numpy as np, os
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
SIZE, SS = 1080, 4                                  # output size, supersampling for clean 1 px strokes
water = np.load(os.path.join(OUT, 'water.npy'))
W = ndi.zoom((water > 0.6).astype(np.float32), SIZE / water.shape[0], order=1) > 0.5
W = ndi.binary_erosion(W, iterations=3)             # keep clear of the shore
YH = 0.12
def s_of(y): return float(np.clip((y - YH) / (1 - YH), 0.035, 1.0))

MAX_W = 5.0                                          # widest ring, px at 1080 (the old ones reached 27)
rng = np.random.default_rng(20261123)
ys, xs = np.nonzero(W)
for frame in (1, 2):
    big = Image.new('L', (SIZE * SS, SIZE * SS), 0); d = ImageDraw.Draw(big)
    taken = np.zeros((SIZE, SIZE), bool)          # ripples do not overlap; keeps each ring its own size
    placed = 0
    for k in rng.permutation(len(ys)):
        if placed >= 700: break          # owner, 2026-11-22: too busy at 1,400
        if taken[max(0, ys[k] - 4):ys[k] + 5, max(0, xs[k] - 5):xs[k] + 6].any(): continue
        taken[ys[k], xs[k]] = True; placed += 1
        y, x = ys[k] / SIZE, xs[k] / SIZE
        s = s_of(y)
        rx = (0.9 + 1.6 * rng.random()) * (0.35 + 0.65 * s)     # half-width, px at 1080: about 0.4 .. 2.5
        ry = rx * (0.30 + 0.25 * s)                              # seen obliquely: flatter with distance
        a = int(255 * (0.25 + 0.35 * rng.random()))
        cx, cy = xs[k] * SS, ys[k] * SS
        d.ellipse([cx - rx * SS, cy - ry * SS, cx + rx * SS, cy + ry * SS], outline=a, width=max(1, SS // 2))
    alpha = big.resize((SIZE, SIZE), Image.LANCZOS)
    im = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0)); im.putalpha(alpha)
    im.save(os.path.join(OUT, f'ringsw{frame}.webp'), 'WEBP', quality=90, method=6)
    lab, n = ndi.label(np.asarray(alpha) > 10)
    widest = max((sl[1].stop - sl[1].start for sl in ndi.find_objects(lab)), default=0)
    assert widest <= MAX_W + 1, f'ring {widest} px wide'
    print(f'ringsw{frame}: {n} rings, widest {widest} px, {os.path.getsize(os.path.join(OUT, f"ringsw{frame}.webp"))} bytes')
