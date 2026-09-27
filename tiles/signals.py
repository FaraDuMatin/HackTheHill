"""One traffic-signal dot per intersection.

OSM maps a signal per stop line and per sidewalk crossing, so one intersection
can have 10+ `highway=traffic_signals` nodes. We keep nodes on drivable roads,
merge the ones within MERGE_M of each other, and place the dot on the road
junction closest to the group's centre.

Groups wider than FLAG_M may have merged two separate intersections; they are
written to data/signal_flags.geojson for manual review.
"""
import json
import math
from collections import defaultdict

import osmium

MERGE_M = 35
FLAG_M = 60

ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "motorway_link", "trunk_link", "primary_link",
    "secondary_link", "tertiary_link",
}


def _dist_m(a, b):
    """Equirectangular distance between (lng, lat) points; fine at city scale."""
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320


def _groups(points):
    """Union-find over points closer than MERGE_M (grid-bucketed)."""
    ids = list(points)
    parent = {i: i for i in ids}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cell = MERGE_M / 111_320
    grid = defaultdict(list)
    for i in ids:
        lng, lat = points[i]
        grid[(int(lng / cell), int(lat / cell))].append(i)
    for (cx, cy), members in grid.items():
        near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in grid.get((cx + dx, cy + dy), [])]
        for i in members:
            for j in near:
                if i < j and _dist_m(points[i], points[j]) <= MERGE_M:
                    parent[find(i)] = find(j)

    groups = defaultdict(list)
    for i in ids:
        groups[find(i)].append(i)
    return list(groups.values())


def build_signals(pbf, out_path, flags_path):
    signals = {}  # node id -> (lng, lat)
    on_road = set()
    degree = defaultdict(int)  # node id -> number of road-way references
    road_nodes = {}
    # Sorted PBF: all nodes come before ways.
    for o in osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations():
        if o.is_node():
            if o.tags.get("highway") == "traffic_signals":
                signals[o.id] = (o.location.lon, o.location.lat)
            continue
        if o.tags.get("highway") not in ROADS:
            continue
        for nd in o.nodes:
            degree[nd.ref] += 1
            if nd.ref in signals:
                on_road.add(nd.ref)
            road_nodes[nd.ref] = (nd.location.lon, nd.location.lat)

    points = {i: signals[i] for i in on_road}
    features, flags = [], []
    for g in _groups(points):
        centre = (sum(points[i][0] for i in g) / len(g), sum(points[i][1] for i in g) / len(g))
        span = max((_dist_m(points[a], points[b]) for a in g for b in g), default=0)
        # Nearest road junction (node shared by 2+ road ways) to the centre, within MERGE_M.
        junctions = [n for n in _nearby(road_nodes, centre) if degree[n] >= 2]
        best = min(junctions, key=lambda n: _dist_m(road_nodes[n], centre), default=None)
        at = road_nodes[best] if best and _dist_m(road_nodes[best], centre) <= MERGE_M else centre
        props = {"osm_id": min(g), "count": len(g)}
        features.append(_point(at, props))
        if span > FLAG_M:
            flags.append(_point(at, {**props, "span_m": round(span), "osm_ids": sorted(g)}))

    _write(out_path, features)
    _write(flags_path, flags)
    print(f"signals: {len(signals)} OSM nodes, {len(points)} on roads -> {len(features)} dots, {len(flags)} flagged")


_road_grid = {}


def _nearby(road_nodes, at):
    """Road nodes in the grid cells around `at` (grid built lazily once)."""
    cell = MERGE_M / 111_320
    if not _road_grid:
        for n, (lng, lat) in road_nodes.items():
            _road_grid.setdefault((int(lng / cell), int(lat / cell)), []).append(n)
    cx, cy = int(at[0] / cell), int(at[1] / cell)
    return [n for dx in (-1, 0, 1) for dy in (-1, 0, 1) for n in _road_grid.get((cx + dx, cy + dy), [])]


def _point(at, props):
    return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [round(at[0], 7), round(at[1], 7)]}}


def _write(path, features):
    with open(path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
