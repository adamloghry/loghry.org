"""Red aircraft-warning lights, placed on real structures by the fitted camera (owner, 2026-11-23: align to the skyline).

Heights: OSM's height tag where present; otherwise the structure's published height, noted below. Writes
src/sky/beacons.json (stage pixels, 1440 wide) for the page. Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, os
from geo import enu, elev, project

HERE = os.path.dirname(os.path.abspath(__file__))
prm = json.load(open(os.path.join(HERE, 'camera.json')))
# name, lat, lon, height above ground (m), size px
STRUCTURES = [
    ('Space Needle', 47.6205062, -122.3493037, 184, 4),
    ('Columbia Center', 47.60450, -122.33072, 286, 4),
    # not Rainier Square Tower: the photo (April 2018) predates it; its light would hang in empty sky
    ('KOMO-TV tower, Queen Anne', 47.6321444, -122.3539681, 172, 3),
    ('KING-TV tower, Queen Anne', 47.6318441, -122.3510539, 160, 3),          # OSM has no height; ~160 m
    ('KCTS/KUOW mast, Capitol Hill', 47.6158636, -122.3090822, 150, 3),       # OSM has no height; ~150 m
    ('KTZZ mast, Capitol Hill', 47.6157805, -122.3083238, 150, 3),            # OSM has no height; ~150 m
]
out = []
for name, lat, lon, h, size in STRUCTURES:
    q, z = project(enu([lat], [lon], [elev(lat, lon) + h]), prm)
    x, y = float(q[0, 0]), float(q[0, 1])
    if z[0] > 0 and 0 <= x < 1 and 0 <= y < 1:
        out.append({'name': name, 'x': round(x * 1440), 'y': round(y * 1440), 'size': size})
        print(f'{name:32s} x={x:.4f} y={y:.4f}')
json.dump(out, open(os.path.join(HERE, '..', '..', 'src', 'sky', 'beacons.json'), 'w'), indent=1)
