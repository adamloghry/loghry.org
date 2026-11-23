"""Geometry for the fixed camera: terrain heights, local metric coordinates, the pinhole camera and OSM road access.

Data (OpenStreetMap, ODbL; terrain tiles) is read from bake/osm/cache/, filled by fetch.py. See bake/osm/README.md."""
import json, math, glob, os
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

LAT0, LON0 = 47.665, -122.334
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574.0
R_EARTH = 6371000.0

# ---------------- terrain (terrarium tiles, z13) ----------------
Z = 13
tiles = {}
for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', 'terrain', '13_*.png')):
    _, x, y = os.path.basename(f)[:-4].split('_')
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float64)
    tiles[(int(x), int(y))] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
def elev(lat, lon):
    n = 2 ** Z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    tx, ty = int(fx), int(fy); px, py = (fx - tx) * 256 - 0.5, (fy - ty) * 256 - 0.5
    t = tiles.get((tx, ty))
    if t is None: return 0.0
    i, j = int(np.clip(py, 0, 254)), int(np.clip(px, 0, 254)); u, v = np.clip(px - j, 0, 1), np.clip(py - i, 0, 1)
    return float(t[i, j] * (1 - u) * (1 - v) + t[i, j + 1] * u * (1 - v) + t[i + 1, j] * (1 - u) * v + t[i + 1, j + 1] * u * v)

def enu(lat, lon, h):
    e, n = (np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY
    return np.stack([e, n, np.asarray(h) - (e * e + n * n) / (2 * R_EARTH)], -1)

# ---------------- camera ----------------
def rot(yaw, pitch, roll):
    # yaw: heading of the optical axis, degrees clockwise from north; pitch: degrees below horizontal; roll: degrees
    y, p, r = map(math.radians, (yaw, pitch, roll))
    f = np.array([math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), -math.sin(p)])
    right0 = np.array([math.cos(y), -math.sin(y), 0.0])
    up0 = np.cross(right0, f)
    right = right0 * math.cos(r) + up0 * math.sin(r); up = np.cross(right, f)
    return f, right, up

def project(P, prm):
    E, N, U, yaw, pitch, roll, foc, k1, cx, cy = prm
    f, r, u = rot(yaw, pitch, roll)
    d = P - np.array([E, N, U])
    z = d @ f; x = (d @ r) / z; y = (d @ u) / z
    rr = x * x + y * y; s = 1 + k1 * rr
    # radial distortion r(1 + k1 r^2) stops increasing at r^2 = 1 / (3 |k1|) when k1 < 0; beyond that, points far outside
    # the frame would fold back into it. Treat them as not visible (behind the camera).
    if k1 < 0: z = np.where(rr < 1 / (3 * -k1), z, -1.0)
    return np.stack([cx + foc * x * s, cy - foc * y * s], -1), z

# ---------------- OSM roads ----------------
ROADS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', 'roads.json')))['elements']
def ways(pred):
    out = []
    for w in ROADS:
        t = w['tags']
        if pred(t):
            g = w['geometry']; lat = np.array([p['lat'] for p in g]); lon = np.array([p['lon'] for p in g])
            if t.get('bridge') and t.get('bridge') != 'no':
                h0, h1 = elev(lat[0], lon[0]), elev(lat[-1], lon[-1]); s = np.linspace(0, 1, len(lat)); h = h0 + (h1 - h0) * s
                if 'Ship Canal Bridge' in t.get('name', '') and t.get('ref') == 'I 5': h = np.maximum(h, 55.0)   # upper deck ~55 m above the canal
            elif t.get('tunnel') and t.get('tunnel') != 'no':
                continue
            else:
                h = np.array([elev(a, b) for a, b in zip(lat, lon)])
            out.append((t, enu(lat, lon, h + 1.0)))
    return out

def densify(P, step=10.0):
    out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for k in range(1, n + 1): out.append(a + (b - a) * k / n)
    return np.array(out)

I5 = [densify(P) for t, P in ways(lambda t: t.get('ref', '').startswith('I 5') and t.get('highway') == 'motorway')]
def named(*names): return [densify(P) for t, P in ways(lambda t: t.get('name') in names)]
NORTHLAKE = named('North 34th Street', 'North Northlake Way', 'Northeast Northlake Way')
WESTLAKE = named('Westlake Avenue North', 'Westlake Avenue')
EASTLAKE = named('Eastlake Avenue East')

