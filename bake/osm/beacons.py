"""Red aircraft-warning lights, placed on real structures by the fitted camera (owner, 2026-11-23: align to the skyline).

Heights: OSM's height tag where present; otherwise the structure's published height, noted below. Writes
src/sky/beacons.json (stage pixels, 1440 wide) for the page. Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, os
import numpy as np
from scipy import ndimage as ndi
from geo import enu, elev, project

HERE = os.path.dirname(os.path.abspath(__file__))
prm = json.load(open(os.path.join(HERE, 'camera.json')))
# name, lat, lon, height above ground (m), size px
STRUCTURES = [
    ('Space Needle', 47.6205062, -122.3493037, 184, 4),
    ('Columbia Center', 47.60450, -122.33072, 286, 4),
    # not Rainier Square Tower: the photo (April 2018) predates it; its light would hang in empty sky
    ('KOMO-TV tower, Queen Anne', 47.6321444, -122.3539681, 172, 3),
    ('KING-TV tower, Queen Anne', 47.6318441, -122.3510539, 160, 3),          # no published height found; ~160 m, like its neighbours
    # Capitol Hill's three broadcast towers near 18th Ave & E Madison: 594, 637 and 682 ft (181, 194, 208 m) per
    # CHS Capitol Hill Seattle (2018). Which height belongs to which mast is not published; listed in OSM order.
    ('KCTS/KUOW mast, Capitol Hill', 47.6158636, -122.3090822, 208, 3),
    ('KTZZ mast, Capitol Hill', 47.6157805, -122.3083238, 194, 3),
    ('Capitol Hill mast (third)', 47.6154256, -122.3094080, 181, 3),
]
# how deep each beacon sits in the photo's own baked cloud (0 clear .. 1 thick): the page softens and dims it
# Measured along the structure's height, ignoring water: the hazy bay behind the Needle is not cloud.
cloud = ndi.gaussian_filter(np.load(os.path.join(HERE, '..', 'scripts', 'out', 'cloud.npy')), 4)
water = np.load(os.path.join(HERE, '..', 'scripts', 'out', 'water.npy'))
NC = cloud.shape[0]
def haze_along(lat, lon, h):
    vals = []
    for f in np.linspace(0.1, 1.0, 10):
        q, z = project(enu([lat], [lon], [elev(lat, lon) + h * f]), prm)
        i, j = int(np.clip(q[0, 1], 0, 0.999) * NC), int(np.clip(q[0, 0], 0, 0.999) * NC)
        if water[i, j] < 0.5: vals.append(cloud[i, j])
    raw = float(np.clip(np.mean(vals) * 1.6, 0, 1)) if vals else 0.0
    return float(np.clip((raw - 0.3) / 0.5, 0, 1))   # light general haze (the Needle's ~0.26) counts as clear
out = []
for name, lat, lon, h, size in STRUCTURES:
    q, z = project(enu([lat], [lon], [elev(lat, lon) + h]), prm)
    x, y = float(q[0, 0]), float(q[0, 1])
    if z[0] > 0 and 0 <= x < 1 and 0 <= y < 1:
        haze = haze_along(lat, lon, h)
        out.append({'name': name, 'x': round(x * 1440), 'y': round(y * 1440), 'size': size, 'haze': round(haze, 2)})
        print(f'{name:32s} x={x:.4f} y={y:.4f} haze={haze:.2f}')
json.dump(out, open(os.path.join(HERE, '..', '..', 'src', 'sky', 'beacons.json'), 'w'), indent=1)

# Places the lighting calendar draws on (stage pixels): the Needle's saucer ring and the KING 5 tower's height.
def px(lat, lon, h):
    q, _ = project(enu([lat], [lon], [elev(lat, lon) + h]), prm); return [round(float(q[0, 0]) * 1440, 1), round(float(q[0, 1]) * 1440, 1)]
marks = {
    'needleSaucer': px(47.6205062, -122.3493037, 158), 'needleTop': px(47.6205062, -122.3493037, 184),
    'kingBase': px(47.6318441, -122.3510539, 0), 'kingTop': px(47.6318441, -122.3510539, 160),
}
marks['kingHaze'] = round(haze_along(47.6318441, -122.3510539, 160), 2)
json.dump(marks, open(os.path.join(HERE, '..', '..', 'src', 'sky', 'landmarks.json'), 'w'), indent=1)
print(marks)
