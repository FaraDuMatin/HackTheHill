"""Resolve street names and intersections to OSM ways / coordinates.

The agent only passes names ("Portage Bridge", "Laurier & Courcelette"); this
module turns them into way ids and points so a small LLM never handles ids.
"""
import json
import re
import unicodedata
from collections import defaultdict

import osmium

from ..sim.extract import DATA, ROADS_PBF, build_roads_pbf, dist_m

SIGNALS_GEOJSON = DATA.parent / "frontend" / "public" / "tiles" / "signals.geojson"
SIGNAL_SNAP_M = 40

# Words that don't identify a street (EN + FR road types, articles).
GENERIC = {
    "street", "st", "rue", "avenue", "ave", "av", "road", "rd", "chemin", "ch", "boulevard", "blvd", "boul",
    "drive", "dr", "promenade", "prom", "bridge", "pont", "parkway", "pkwy", "way", "lane", "place", "pl",
    "crescent", "cres", "court", "ct", "highway", "hwy", "autoroute", "route", "the", "du", "de", "des",
    "la", "le", "les", "of", "east", "west", "north", "south", "est", "ouest", "nord", "sud", "e", "w", "n", "s",
}


def _tokens(name):
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return [t for t in re.split(r"[^a-z0-9]+", name) if t]


ARTICLES = {"the", "du", "de", "des", "la", "le", "les", "of", "d", "l"}
SYNONYMS = {
    "pont": "bridge", "rue": "street", "st": "street", "ave": "avenue", "av": "avenue", "rd": "road",
    "chemin": "road", "ch": "road", "blvd": "boulevard", "boul": "boulevard", "dr": "drive",
    "prom": "promenade", "pkwy": "parkway", "hwy": "highway", "autoroute": "highway", "e": "east",
    "est": "east", "w": "west", "ouest": "west", "n": "north", "nord": "north", "s": "south", "sud": "south",
}


def _canon(name):
    """Tokens with EN/FR synonyms unified and articles dropped: 'Pont du Portage' -> {bridge, portage}."""
    return frozenset(SYNONYMS.get(t, t) for t in _tokens(name) if t not in ARTICLES)


def _core(name):
    return {t for t in _tokens(name) if t not in GENERIC} or set(_tokens(name))


class Places:
    def __init__(self):
        build_roads_pbf()
        self.ways = {}  # way id -> (name, [node ids])
        self.names = defaultdict(list)  # display name -> [way ids]
        self.node_loc = {}
        for o in osmium.FileProcessor(str(ROADS_PBF), osmium.osm.NODE | osmium.osm.WAY).with_locations():
            if not o.is_way():
                continue
            names = {o.tags.get(k) for k in ("name", "name:en", "name:fr", "alt_name", "ref")} - {None}
            if not names:
                continue
            nodes = [n.ref for n in o.nodes]
            for n in o.nodes:
                self.node_loc[n.ref] = (n.location.lon, n.location.lat)
            self.ways[o.id] = (o.tags.get("name") or next(iter(names)), nodes)
            for name in names:
                self.names[name].append(o.id)
        self.signals = json.loads(SIGNALS_GEOJSON.read_text())["features"] if SIGNALS_GEOJSON.exists() else []

    def _in_bbox(self, way_id, bbox):
        if not bbox:
            return True
        w, s, e, n = bbox
        return any(w <= lng <= e and s <= lat <= n for lng, lat in (self.node_loc[x] for x in self.ways[way_id][1]))

    def find_road(self, query, bbox=None):
        """-> (display name, [way ids]) or raises LookupError with a message for the model."""
        qc, qcore = _canon(query), _core(query)
        levels = (
            [n for n in self.names if _canon(n) == qc],  # same name (EN/FR variants)
            [n for n in self.names if qc <= _canon(n)],  # all words present
            [n for n in self.names if qcore <= _core(n)],  # distinctive words present
        )
        for candidates in levels:
            # Group ways by their main name's canonical form: "Pont du Portage" and
            # "Pont du Portage Bridge" are the same road.
            groups = defaultdict(lambda: [None, set()])
            for name in candidates:
                for w in self.names[name]:
                    if self._in_bbox(w, bbox):
                        g = groups[_canon(self.ways[w][0])]
                        g[0] = g[0] or self.ways[w][0]
                        g[1].add(w)
            # Same canonical name can still be different roads (Ottawa's Wellington Street vs
            # Gatineau's Rue Wellington): split by connectivity, then regroup by main name.
            all_ways = set().union(*(ways for _, ways in groups.values())) if groups else set()
            roads = {}
            for comp in self._components(all_ways):
                main = max({self.ways[w][0] for w in comp}, key=lambda m: sum(self.ways[w][0] == m for w in comp))
                roads.setdefault(main, set()).update(comp)
            # The user typed one road's exact name: take it.
            exact = [m for m in roads if set(_tokens(m)) == set(_tokens(query))]
            if len(roads) > 1 and len(exact) == 1:
                return exact[0], sorted(roads[exact[0]])
            if len(roads) == 1:
                ((main, ways),) = roads.items()
                return main, sorted(ways)
            if len(roads) > 1:
                options = sorted(roads, key=lambda m: -len(roads[m]))[:6]
                raise LookupError(f"'{query}' matches several roads: {', '.join(options)}. Ask the user which one.")
        where = " in the selected area" if bbox else ""
        raise LookupError(f"No road named '{query}'{where}.")

    def _components(self, ways):
        """Groups of ways that touch or run within ~150 m of each other (e.g. the two
        carriageways of a divided road)."""
        parent = {w: w for w in ways}

        def find(w):
            while parent[w] != w:
                parent[w] = parent[parent[w]]
                w = parent[w]
            return w

        cell = 0.0015
        by_cell = {}
        for w in ways:
            for n in self.ways[w][1]:
                lng, lat = self.node_loc[n]
                c = (int(lng / cell), int(lat / cell))
                if c in by_cell:
                    parent[find(w)] = find(by_cell[c])
                else:
                    by_cell[c] = w
        comps = defaultdict(set)
        for w in ways:
            comps[find(w)].add(w)
        return list(comps.values())

    def intersection(self, a, b, bbox=None):
        """-> (lng, lat) where roads a and b meet."""
        _, ways_a = self.find_road(a, bbox)
        _, ways_b = self.find_road(b, bbox)
        nodes_a = {n for w in ways_a for n in self.ways[w][1]}
        shared = [n for w in ways_b for n in self.ways[w][1] if n in nodes_a]
        if not shared:
            raise LookupError(f"'{a}' and '{b}' do not intersect.")
        pts = [self.node_loc[n] for n in shared]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    def signal_at(self, at):
        """Key of the map's signal dot nearest to `at` (within SIGNAL_SNAP_M), else None."""
        best = min(self.signals, key=lambda f: dist_m(f["geometry"]["coordinates"], at), default=None)
        if best and dist_m(best["geometry"]["coordinates"], at) <= SIGNAL_SNAP_M:
            return f"osm:{best['properties']['osm_id']}", best["geometry"]["coordinates"]
        return None

    def road_center(self, way_ids):
        pts = [self.node_loc[n] for w in way_ids for n in self.ways[w][1]]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


_places = None


def places():
    global _places
    if _places is None:
        _places = Places()
    return _places
