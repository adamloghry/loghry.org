"""Project OSM roads through the fitted camera, sample them, and mark each sample visible or hidden by buildings."""
import json, os
import numpy as np
from geo import enu, elev, project, densify

HERE = os.path.dirname(os.path.abspath(__file__))
N = 1800
prm = json.load(open(os.path.join(HERE, 'camera.json')))
D = np.load(os.path.join(HERE, 'cache', 'depth.npy'))
R = json.load(open(os.path.join(HERE, 'cache', 'roads.json')))['elements']

GROUPS = {   # name in lights.py -> OSM tag test
    'i5': lambda t: t.get('highway') == 'motorway' and t.get('ref', '').startswith('I 5'),
    'aurora': lambda t: t.get('name') in ('Aurora Avenue North',) and t.get('highway') in ('trunk', 'motorway'),
    'eastlake': lambda t: t.get('name') in ('Eastlake Avenue East', 'Fairview Avenue North', 'Fairview Avenue East'),
    'westlake': lambda t: t.get('name') in ('Westlake Avenue North', 'Westlake Avenue'),
    'northlake': lambda t: t.get('name') in ('North 34th Street', 'North Northlake Way', 'Northeast Northlake Way', 'Northeast Pacific Street', 'North Pacific Street'),
}

def way_points(w):
    g = w['geometry']; lat = np.array([p['lat'] for p in g]); lon = np.array([p['lon'] for p in g]); t = w['tags']
    if t.get('tunnel') not in (None, 'no'): return None
    if t.get('bridge') not in (None, 'no'):
        h0, h1 = elev(lat[0], lon[0]), elev(lat[-1], lon[-1]); h = h0 + (h1 - h0) * np.linspace(0, 1, len(lat))
        if 'Ship Canal Bridge' in t.get('name', '') and t.get('ref') == 'I 5': h = np.maximum(h, 55.0)   # upper deck ~55 m above the canal
    else:
        h = np.array([elev(a, b) for a, b in zip(lat, lon)])
    if t.get('layer') and t['layer'].lstrip('-').isdigit() and int(t['layer']) > 0: h = h + 6 * int(t['layer'])
    return densify(enu(lat, lon, h + 1.5), 4.0)

def visible(q, z):
    x, y = q[:, 0], q[:, 1]
    inside = (x >= 0) & (x < 1) & (y >= 0) & (y < 1) & (z > 0)
    i = np.clip((y * N).astype(int), 0, N - 1); j = np.clip((x * N).astype(int), 0, N - 1)
    # nearest building surface at that pixel (3x3 min) must not be nearer than the road
    nb = np.min(np.stack([D[np.clip(i + di, 0, N - 1), np.clip(j + dj, 0, N - 1)] for di in (-1, 0, 1) for dj in (-1, 0, 1)]), 0)
    return inside, inside & (nb > z - 8)

if __name__ == '__main__':
    out = {}
    for name, test in GROUPS.items():
        segs = []; tot = vis = 0
        for w in R:
            if not test(w['tags']): continue
            P = way_points(w)
            if P is None: continue
            q, z = project(P, prm); inside, v = visible(q, z)
            if not inside.any(): continue
            segs.append([[round(float(a), 5), round(float(b), 5), int(c), round(float(zz), 1)] for (a, b), c, zz, k in zip(q, v, z, inside) if k])
            tot += int(inside.sum()); vis += int(v.sum())
        out[name] = segs
        print(f'{name}: {len(segs)} ways, {tot} samples in frame, {vis / max(tot, 1) * 100:.0f}% visible')
    json.dump(out, open(os.path.join(HERE, 'roadsamples.json'), 'w'))
