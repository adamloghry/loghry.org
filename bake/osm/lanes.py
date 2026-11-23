"""I-5 car lanes for the page: OSM's one-way mainline ways chained per direction, projected, cut where hidden."""
import json, os
import numpy as np
from geo import enu, project
from roadsamples import way_points, visible, R, prm

HERE = os.path.dirname(os.path.abspath(__file__))

def chain(ways):
    """Join one-way ways end to start into the longest continuous sequence of node coordinates."""
    segs = [[(p['lat'], p['lon']) for p in w['geometry']] for w in ways]
    by_start = {}
    for i, s in enumerate(segs): by_start.setdefault(s[0], []).append(i)
    best = []
    for i, s in enumerate(segs):
        path, used, cur = list(s), {i}, s
        while True:
            nxt = [j for j in by_start.get(cur[-1], []) if j not in used]
            if not nxt: break
            j = max(nxt, key=lambda k: len(segs[k])); used.add(j); cur = segs[j]; path += cur[1:]
        if len(path) > len(best): best = path
    return best

def lane(direction):
    ws = [w for w in R if w['tags'].get('highway') == 'motorway' and w['tags'].get('ref') == 'I 5' and w['tags'].get('oneway') == 'yes'
          and ((w['geometry'][-1]['lat'] - w['geometry'][0]['lat']) > 0) == (direction == 'nb')]
    pts = chain(ws)
    # heights per node from the way each node came from (bridges keep their deck height; see way_points)
    node_h = {}
    for w in ws:
        P_w = way_points(w)
        if P_w is None: continue
        g = w['geometry']
        # way_points densifies; recover the per-node heights by projecting the original nodes' order onto it
        lat = np.array([p['lat'] for p in g]); lon = np.array([p['lon'] for p in g])
        E = enu(lat, lon, np.zeros(len(lat)))
        for k, (la, lo) in enumerate(zip(lat, lon)):
            j = int(np.argmin(np.hypot(P_w[:, 0] - E[k, 0], P_w[:, 1] - E[k, 1]))); node_h[(la, lo)] = float(P_w[j, 2])
    lat = np.array([a for a, b in pts]); lon = np.array([b for a, b in pts])
    E = enu(lat, lon, np.zeros(len(lat)))
    E[:, 2] += np.array([node_h.get((a, b), 0.0) for a, b in pts])
    from geo import densify
    from scipy import ndimage as ndi
    P = densify(E, 4.0)
    P[:, 2] = ndi.gaussian_filter1d(P[:, 2], 40)   # ~160 m: the freeway eases on and off the bridge deck, no steps
    q, z = project(P, prm); inside, v = visible(q, z)
    # keep the stretch from the bottom of the frame up to where the freeway first disappears behind downtown
    order = np.argsort(-q[:, 1]) if False else None
    keep = inside.copy()
    # walk from the near end (largest y) toward the far end; stop at the first long hidden run above y 0.3
    idx = np.where(inside)[0]
    if direction == 'nb': idx = idx[::-1]          # NB runs toward the camera: start from its far end reversed below
    near_first = idx if q[idx[0], 1] > q[idx[-1], 1] else idx[::-1]
    out, hidden = [], 0
    for k in near_first:
        if not v[k] and q[k, 1] < 0.30:
            hidden += 1
            if hidden > 6: break
        else: hidden = 0
        out.append(q[k])
    out = np.array(out)
    if direction == 'nb': out = out[::-1]           # NB cars drive from the far end toward the camera
    # thin to ~1.5 px steps at 1440 and round
    keep = [0]
    for i in range(1, len(out)):
        if np.hypot(*(out[i] - out[keep[-1]])) * 1440 >= 1.5: keep.append(i)
    return [[round(float(x) * 1440, 1), round(float(y) * 1440, 1)] for x, y in out[keep]]

if __name__ == '__main__':
    L = {'nb': lane('nb'), 'sb': lane('sb')}
    for k, v in L.items(): print(k, len(v), 'points; from', v[0], 'to', v[-1])
    json.dump(L, open(os.path.join(HERE, '..', '..', 'src', 'sky', 'i5_lanes.json'), 'w'))
