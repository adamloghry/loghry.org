"""Copy the finished layers from bake/scripts/out into src/assets/sky. Only the files the page uses are copied."""
import os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); STATIC = os.path.join(HERE, '..', 'static')
DST = os.path.join(HERE, '..', '..', 'src', 'assets', 'sky')
PLATES = ['plate_day', 'plate_golden_am', 'plate_golden_pm', 'plate_blue', 'plate_blue_lit', 'plate_night_eve', 'plate_night_late', 'holiday']  # WebP + AVIF
LAYERS = ['bloom', 'linework', 'cloud1_t', 'cloud2_t', 'fog_a', 'rain_far', 'rain_mid', 'rain_near', 'rain_veil',
          'water_a', 'lake_a', 'foliage_a', 'snow_a', 'stars_a', 'ripple_a', 'glitter_a', 'flakes_a', 'ringsw1', 'ringsw2', 'clear_a'] + [f'towers_g{k}' for k in range(8)]                                 # WebP only
STATIC_LAYERS = []                                                                                                                 # hand-made, not derived from the photo (rain rings now come from rings.py)
os.makedirs(DST, exist_ok=True); total = 0; missing = []
def put(src):
    global total
    if not os.path.exists(src): missing.append(src); return
    shutil.copy(src, DST); total += os.path.getsize(src)
for n in PLATES: put(os.path.join(OUT, n + '.webp')); put(os.path.join(OUT, n + '.avif'))
for n in LAYERS: put(os.path.join(OUT, n + '.webp'))
for n in STATIC_LAYERS: put(os.path.join(STATIC, n + '.webp'))
if missing: sys.exit('missing baked files:\n  ' + '\n  '.join(missing))
keep = {n + e for n in PLATES for e in ('.webp', '.avif')} | {n + '.webp' for n in LAYERS + STATIC_LAYERS}
stray = sorted(set(os.listdir(DST)) - keep)
if stray: print('note: files in src/assets/sky that the bake does not produce:', ', '.join(stray))
print('installed %d files, %.2f MB' % (len(keep), total / 1e6))
