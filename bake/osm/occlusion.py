"""Depth image of OSM buildings (extruded) as seen by the fitted camera; road samples tested against it."""
import glob, json, math, os
import numpy as np
from PIL import Image, ImageDraw
from geo import enu, elev, project, rot, ways, densify

HERE = os.path.dirname(os.path.abspath(__file__))
N = 1800
prm = json.load(open(os.path.join(HERE, 'camera.json')))
CAM = np.array(prm[:3])

def height(t):
    for k in ('height', 'building:height'):
        v = str(t.get(k, '')).split()[0].replace('m', '') if t.get(k) else ''
        try: return float(v)
        except ValueError: pass
    if t.get('building:levels'):
        try: return float(t['building:levels']) * 3.5 + 1
        except ValueError: pass
    return {'house': 7.5, 'detached': 7.5, 'garage': 3, 'shed': 3, 'roof': 4}.get(t.get('building'), 10.0)

def buildings():
    B = []
    for f in sorted(glob.glob(os.path.join(HERE, 'cache', 'b_*.json'))):
        try: B += json.load(open(f))['elements']
        except Exception: pass
    seen = set()
    for e in B:
        if e['id'] in seen or 'geometry' not in e: continue
        seen.add(e['id'])
        lat = np.array([p['lat'] for p in e['geometry']]); lon = np.array([p['lon'] for p in e['geometry']])
        yield lat, lon, height(e.get('tags', {}))

def depth_image():
    faces = []
    for lat, lon, h in buildings():
        g = elev(lat.mean(), lon.mean())
        lo = enu(lat, lon, np.full(len(lat), g)); hi = enu(lat, lon, np.full(len(lat), g + h))
        qa, za = project(lo, prm); qb, zb = project(hi, prm)
        if (za <= 0).any() or (zb <= 0).any(): continue
        if qb[:, 0].max() < -0.05 or qb[:, 0].min() > 1.05 or qb[:, 1].max() < 0 or qa[:, 1].min() > 1.05: continue
        faces.append((float(zb.mean()), [(x * N, y * N) for x, y in qb]))                       # roof
        for i in range(len(lat) - 1):                                                              # walls
            quad = [qa[i], qa[i + 1], qb[i + 1], qb[i]]
            faces.append((float((za[i] + za[i + 1]) / 2), [(x * N, y * N) for x, y in quad]))
    faces.sort(key=lambda f: -f[0])                                                                # far to near
    img = Image.new('F', (N, N), 1e9); d = ImageDraw.Draw(img)
    for z, poly in faces: d.polygon(poly, fill=z)
    return np.asarray(img), len(faces)

if __name__ == '__main__':
    D, n = depth_image()
    np.save(os.path.join(HERE, 'cache', 'depth.npy'), D.astype(np.float32))
    print('faces', n, 'covered', round(float((D < 1e8).mean()) * 100, 1), '%')
    # visualise: buildings shaded by depth over the photo
    photo = np.asarray(Image.open(os.path.join(HERE, '..', 'original.png')).convert('RGB').resize((N, N))).astype(np.float32)
    m = D < 1e8; shade = np.clip(1 - np.log(np.where(m, D, 1)) / np.log(15000), 0, 1)
    out = photo * 0.5; out[m] = out[m] * 0.4 + np.stack([shade[m] * 255, shade[m] * 120, 255 - shade[m] * 255], -1) * 0.6
    Image.fromarray(out.astype(np.uint8)).save(os.path.join(HERE, 'cache', 'depth.png'))
