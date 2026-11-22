#!/usr/bin/env bash
# Rebuild every image layer from bake/original.png and copy the results into src/assets/sky.
# Needs python3 with numpy, scipy and Pillow >= 11.3 (AVIF). `nix run .#bake` provides them.
set -euo pipefail
cd "$(dirname "$0")/scripts"
N="${1:-1800}"
python3 - <<'PY'
from PIL import features
import sys
if not features.check('avif'): sys.exit('this Pillow cannot write AVIF; use Pillow >= 11.3 built with libavif')
PY
for step in "masks.py $N" "lights.py $N" "plates.py $N" rain.py extras.py lit.py install.py; do
  echo "== $step"; python3 $step
done
