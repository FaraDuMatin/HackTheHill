"""Cut a bbox of drivable roads out of the OSM extract."""
import json
import math
from collections import defaultdict
from pathlib import Path

import osmium

DATA = Path(__file__).resolve().parents[3] / "data"
BASE_PBF = DATA / "ottawa.osm.pbf"
ROADS_PBF = DATA / "roads.osm.pbf"
JUNCTIONS_JSON = DATA / "junctions.json"

ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "road", "motorway_link", "trunk_link", "primary_link",
    "secondary_link", "tertiary_link",
}


def _is_road(way):
    return way.tags.get("highway") in ROADS


def build_roads_pbf():
    """Roads-only copy of the extract (with node tags, e.g. signals). Built once."""
    if ROADS_PBF.exists():
        return
    with osmium.BackReferenceWriter(str(ROADS_PBF), ref_src=str(BASE_PBF), overwrite=True, remove_tags=False) as writer:
        for way in osmium.FileProcessor(str(BASE_PBF), osmium.osm.WAY):
            if _is_road(way):
                writer.add_way(way)


def extract_bbox(bbox, out_path):
    """bbox = (west, south, east, north). Writes OSM XML for netconvert."""
    build_roads_pbf()
    west, south, east, north = bbox

    def inside(loc):
        return loc.valid() and west <= loc.lon <= east and south <= loc.lat <= north

    with osmium.BackReferenceWriter(str(out_path), ref_src=str(ROADS_PBF), overwrite=True, remove_tags=False) as writer:
        for obj in osmium.FileProcessor(str(ROADS_PBF), osmium.osm.NODE | osmium.osm.WAY).with_locations():
            if obj.is_way() and any(inside(n.location) for n in obj.nodes):
                writer.add_way(obj)


# --- Intersection index (for snapping signals) ---

_CELL = 0.001  # ~100 m grid cells
_grid = None


def _build_junctions():
    """Road nodes where roads actually meet (not just a way split)."""
    build_roads_pbf()
    count, ends, loc = defaultdict(int), defaultdict(int), {}
    for obj in osmium.FileProcessor(str(ROADS_PBF), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if not obj.is_way():
            continue
        nodes = list(obj.nodes)
        for i, n in enumerate(nodes):
            count[n.ref] += 1
            if i in (0, len(nodes) - 1):
                ends[n.ref] += 1
            loc[n.ref] = (n.location.lon, n.location.lat)
    return [loc[n] for n, c in count.items() if c >= 3 or (c == 2 and ends[n] < 2)]


def _junction_grid():
    global _grid
    if _grid is None:
        if not JUNCTIONS_JSON.exists():
            JUNCTIONS_JSON.write_text(json.dumps(_build_junctions()))
        _grid = defaultdict(list)
        for lng, lat in json.loads(JUNCTIONS_JSON.read_text()):
            _grid[(int(lng / _CELL), int(lat / _CELL))].append((lng, lat))
    return _grid


def dist_m(a, b):
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320


def nearest_junction(lng, lat, max_m):
    grid = _junction_grid()
    cx, cy = int(lng / _CELL), int(lat / _CELL)
    near = [p for dx in (-1, 0, 1) for dy in (-1, 0, 1) for p in grid.get((cx + dx, cy + dy), [])]
    best = min(near, key=lambda p: dist_m(p, (lng, lat)), default=None)
    return best if best and dist_m(best, (lng, lat)) <= max_m else None
