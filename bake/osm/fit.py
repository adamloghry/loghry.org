"""Fit the camera to explicit correspondences: landmarks (OSM positions and heights) found in the photo, plus I-5
points measured on the Ship Canal Bridge deck. Writes camera.json. Residuals print in thousandths of the frame."""
import json, os
import numpy as np
from scipy.optimize import least_squares
from geo import enu, elev, project, ways, densify
# mainline only (the upper deck seen on the Ship Canal Bridge); the express lanes run on the lower deck
_MAIN = ways(lambda t: t.get('ref', '') == 'I 5' and t.get('highway') == 'motorway' and t.get('oneway') == 'yes')
I5 = [densify(P) for t, P in _MAIN]
I5_NB = np.concatenate([densify(P) for t, P in _MAIN if P[-1][1] > P[0][1]])   # northbound: northing increases
I5_SB = np.concatenate([densify(P) for t, P in _MAIN if P[-1][1] <= P[0][1]])

HERE = os.path.dirname(os.path.abspath(__file__))
def g(lat, lon): return elev(lat, lon)
# name, lat, lon, height above ground (m), image x, y, weight
PTS = [
    ('Needle top', 47.62051, -122.34926, 184, 0.7498, 0.1767, 3),
    ('Needle base', 47.62051, -122.34926, 0, 0.7508, 0.2138, 3),
    ('Columbia Center top', 47.60450, -122.33072, 286, 0.4383, 0.1550, 2),
    ('Steam Plant', 47.63106, -122.32751, 15, 0.3722, 0.3298, 1),
    ('Gas Works tip', 47.6444509, -122.3341041, 0, 0.5683, 0.4539, 2),
]
I5_NEAR = [(0.01, 0.75), (0.025, 0.72), (0.04, 0.69), (0.05, 0.67), (0.0618, 0.65), (0.0823, 0.62), (0.1083, 0.58), (0.1286, 0.56), (0.159, 0.51), (0.182, 0.474), (0.1999, 0.448)]

def full(p10): return list(p10)   # all ten: position, heading, tilt, roll, focal length, k1, principal point
def residuals(p10):
    prm = full(p10); r = []
    for _, lat, lon, h, x, y, w in PTS:
        q, _ = project(enu(lat, lon, g(lat, lon) + h)[None], prm); r += [(q[0, 0] - x) * 1000 * w, (q[0, 1] - y) * 1000 * w]
    r += list(deck_centre_misses(prm))
    return np.array(r)

def deck_centre_misses(prm):
    """Measured deck-centre points vs the midpoint of the nearest northbound and southbound mainline points."""
    qn, zn = project(I5_NB, prm); qs, zs = project(I5_SB, prm); qn = qn[zn > 0]; qs = qs[zs > 0]
    out = []
    for x, y in I5_NEAR:
        a = qn[np.argmin(np.hypot(qn[:, 0] - x, qn[:, 1] - y))]; b = qs[np.argmin(np.hypot(qs[:, 0] - x, qs[:, 1] - y))]
        out.append(float(np.hypot((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - y)) * 1000)
    return out

if __name__ == '__main__':
    best = None
    for U in (800, 950, 1100):
        for p0 in (18, 24, 30):
            for f0 in (1.0, 1.2):
                x0 = [0, 0, U, 181, p0, -5, f0, 0.0, 0.5, 0.5]
                r = least_squares(residuals, x0, x_scale=[300, 300, 150, 2, 2, 2, 0.2, 0.05, 0.02, 0.02],
                                  bounds=([-3000, -3000, 300, 165, 5, -20, 0.5, -0.3, 0.4, 0.4], [3000, 3000, 2500, 195, 60, 20, 3.0, 0.3, 0.6, 0.6]))
                if best is None or r.cost < best.cost: best = r
    prm = np.array(full(best.x))
    print('params', np.round(prm, 4).tolist())
    for nm, lat, lon, h, x, y, w in PTS:
        q, _ = project(enu(lat, lon, g(lat, lon) + h)[None], prm); print(f'{nm:22s} off {(q[0, 0] - x) * 1000:+6.1f} {(q[0, 1] - y) * 1000:+6.1f}  (1/1000 frame)')
    print('I-5 deck centre misses:', [round(v, 1) for v in deck_centre_misses(prm)])
    json.dump(prm.tolist(), open(os.path.join(HERE, 'camera.json'), 'w'))
