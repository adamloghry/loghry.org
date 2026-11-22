"""Bake the city lights into the dusk and night photos, so the page shows them with plain opacity (no blend modes).
screen(a, b) is linear in b's strength, so crossfading between these plates is exact:
  plate_blue_lit   = blue hour + all lights          (fades in over plate_blue as lights come on)
  plate_night_eve  = night + streets + all windows    (evening)
  plate_night_late = night + streets + 32% of windows (after midnight; crossfade gives every share in between)"""
import numpy as np, os
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
L = lambda n: np.asarray(Image.open(os.path.join(OUT, n)).convert('RGB')).astype(np.float32) / 255
scr = lambda a, b: 1 - (1 - a) * (1 - b)
night, blue, st, wn = L('plate_night.png'), L('plate_blue.png'), L('streets.png'), L('windows.png')
bl = np.asarray(Image.open(os.path.join(OUT, 'bloom.jpg')).convert('RGB').resize(night.shape[1::-1], Image.BICUBIC)).astype(np.float32) / 255
def save(name, a, q):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8))
    im.save(os.path.join(OUT, name + '.avif'), 'AVIF', quality=q, speed=4); im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=q + 22, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name + '.avif')), os.path.getsize(os.path.join(OUT, name + '.webp')))
save('plate_blue_lit', scr(scr(scr(blue, st), wn * 0.9), bl * 0.16), 56)
save('plate_night_eve', scr(scr(scr(night, st), wn), bl * 0.2), 58)
save('plate_night_late', scr(scr(scr(night, st), wn * 0.32), bl * 0.14), 58)
