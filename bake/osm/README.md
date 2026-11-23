# Roads from the map

Street lights and I-5's moving cars follow **OpenStreetMap** roads projected into the photo through a camera fitted
to it, and are hidden wherever an OSM building stands between the camera and the road. This replaced hand-traced
road lines, which kept crossing rooftops (2026-11-23).

    python3 bake/osm/fetch.py          # map data into bake/osm/cache/ (~90 MB, not committed)
    python3 bake/osm/fit.py            # camera.json from landmark correspondences (optional: it is committed)
    python3 bake/osm/occlusion.py      # cache/depth.npy: extruded OSM buildings as seen by the camera
    python3 bake/osm/roadsamples.py    # roadsamples.json: road samples in image coordinates, visible or hidden
    python3 bake/osm/lanes.py          # src/sky/i5_lanes.json: I-5 car paths for the page

Run with the bake's Python (`nix run .#bake` provides numpy, scipy and Pillow). `bake/scripts/lights.py` reads
`roadsamples.json`; the page imports `src/sky/i5_lanes.json`. Rerun from `occlusion.py` on after changing the camera.

## The camera

`fit.py` fits position, heading, tilt, roll and focal length (principal point at the frame centre, no distortion) to:
the Space Needle's top and base, Columbia Center's top, the Lake Union Steam Plant, the tip of Gas Works Park, and I-5
points measured on the Ship Canal Bridge deck. Residuals are 1-3 thousandths of the frame (the Steam Plant, a rough
point, 8). Result: about 820 m up, heading 180.4 deg, 22.6 deg below horizontal.

## Licences

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL):
https://www.openstreetmap.org/copyright. `roadsamples.json` and `src/sky/i5_lanes.json` are derived from it and are
offered under the ODbL; the site credits OpenStreetMap in the gear panel and the almanac footer.
Terrain: Terrain Tiles (Mapzen / AWS Open Data; USGS 3DEP and others).
