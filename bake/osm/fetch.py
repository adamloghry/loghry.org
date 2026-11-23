"""Download the map data the camera fit and road projection read, into bake/osm/cache/ (not committed).

OpenStreetMap via the public Overpass API (be gentle: tiles with pauses and retries), terrain heights from the open
Terrain Tiles on AWS (terrarium encoding, zoom 13). About 90 MB. Run once; everything else reads the cache.
"""
import json, math, os, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__)); CACHE = os.path.join(HERE, 'cache')
UA = 'loghry-org-bake/1.0 (map extract for a static site)'
API = 'https://overpass-api.de/api/interpreter'

def overpass(query, out):
    path = os.path.join(CACHE, out)
    try:
        if json.load(open(path)).get('elements') is not None: return print(out, 'cached')
    except Exception: pass
    for attempt in range(6):
        subprocess.run(['curl', '-s', '-m', '300', '-A', UA, '--data-urlencode', 'data=' + query, API, '-o', path])
        try: return print(out, len(json.load(open(path))['elements']), 'elements')
        except Exception: print(out, 'retry', attempt + 1); time.sleep(20 * (attempt + 1))
    raise SystemExit(f'could not fetch {out}')

if __name__ == '__main__':
    os.makedirs(os.path.join(CACHE, 'terrain'), exist_ok=True)
    overpass('[out:json][timeout:180];(way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|tertiary)$"](47.575,-122.42,47.685,-122.27););out geom;', 'roads.json')
    lats = [47.58, 47.60625, 47.6325, 47.65875, 47.685]; lons = [-122.40, -122.3675, -122.335, -122.3025, -122.27]
    for i in range(4):
        for j in range(4):
            overpass(f'[out:json][timeout:180];(way["building"]({lats[i]},{lons[j]},{lats[i + 1]},{lons[j + 1]}););out tags geom;', f'b_{i}{j}.json'); time.sleep(3)
    z = 13
    def tile(lat, lon):
        n = 2 ** z; return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    (x0, y1), (x1, y0) = tile(47.575, -122.42), tile(47.685, -122.27)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            f = os.path.join(CACHE, 'terrain', f'{z}_{x}_{y}.png')
            if not os.path.exists(f): subprocess.run(['curl', '-s', '-m', '60', '-A', UA, f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', '-o', f])
    print('terrain tiles', len(os.listdir(os.path.join(CACHE, 'terrain'))))
