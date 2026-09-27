"""Apply a scenario (folded edit state) to a base SUMO network via netconvert.

scenario = {
    "blocked": [osm_way_id, ...],
    "lanes": {osm_way_id: total_lanes, ...},
    "signals_added": [{"key": str, "at": [lng, lat]}, ...],
    "signals_removed": [{"key": str, "at": [lng, lat]}, ...],
}

Edits that cannot be applied are returned in "skipped" with a reason, never
silently dropped.
"""
import math
from collections import defaultdict
from pathlib import Path

import sumolib

from .pipeline import BIN, _run

SNAP_M = 40  # max distance from a signal point to a SUMO junction

NOT_IN_AREA = "Road is outside the simulated area or not drivable"


def _edges_by_way(net):
    by_way = defaultdict(list)
    for edge in net.getEdges():
        orig = edge.getLanes()[0].getParam("origId") or ""
        for way in orig.split():
            by_way[way.lstrip("-")].append(edge)
    return by_way


def _ways_of(edge):
    return [w.lstrip("-") for w in (edge.getLanes()[0].getParam("origId") or "").split()]


def _nearest_junction(net, lng, lat):
    x, y = net.convertLonLat2XY(lng, lat)
    best, best_d = None, SNAP_M
    for node in net.getNodes():
        nx, ny = node.getCoord()
        d = math.hypot(nx - x, ny - y)
        if d < best_d:
            best, best_d = node, d
    return best


def apply_scenario(base_net, scenario, out_net):
    """Write out_net = base_net + scenario. Returns what was applied and skipped."""
    net = sumolib.net.readNet(str(base_net), withInternal=False)
    by_way = _edges_by_way(net)
    work = Path(out_net).parent
    skipped = []

    removed = set()
    for way in scenario.get("blocked", []):
        edges = by_way.get(str(way), [])
        if not edges:
            skipped.append({"kind": "block", "way_id": way, "code": "not_in_area", "reason": NOT_IN_AREA})
        removed |= {e.getID() for e in edges}
    # netconvert may merge several OSM ways into one edge: report every way actually closed.
    affected_ways = sorted({int(w) for e in net.getEdges() if e.getID() in removed for w in _ways_of(e)})

    lane_rows = []
    for way, total in scenario.get("lanes", {}).items():
        edges = [e for e in by_way.get(str(way), []) if e.getID() not in removed]
        if not edges:
            skipped.append({"kind": "lanes", "way_id": int(way), "code": "not_in_area", "reason": NOT_IN_AREA})
            continue
        two_way = any(e.getID().startswith("-") for e in edges) and any(not e.getID().startswith("-") for e in edges)
        per_dir = max(1, int(total) // 2) if two_way else max(1, int(total))
        lane_rows += [f'  <edge id="{e.getID()}" numLanes="{per_dir}"/>' for e in edges]

    def junctions(items, want_signal, kind, code, reason):
        found = {}
        for s in items:
            j = _nearest_junction(net, *s["at"])
            if j is None:
                skipped.append({"kind": kind, "key": s["key"], "code": "no_junction",
                                "reason": "No intersection within 40 m in the simulated area"})
            elif (j.getType() == "traffic_light") != want_signal:
                skipped.append({"kind": kind, "key": s["key"], "code": code, "reason": reason})
            else:
                found[j.getID()] = s["key"]
        return found

    tls_unset = junctions(scenario.get("signals_removed", []), True, "remove_signal", "no_signal",
                          "No signal at this intersection in SUMO")
    tls_set = junctions(scenario.get("signals_added", []), False, "add_signal", "has_signal",
                        "Intersection already has a signal")
    # A signal moved within the same intersection: no change.
    for j in set(tls_set) & set(tls_unset):
        del tls_set[j], tls_unset[j]

    args = [BIN / "netconvert", "-s", base_net, "-o", out_net, "--no-warnings"]
    if removed:
        args += ["--remove-edges.explicit", ",".join(sorted(removed))]
    if lane_rows:
        patch = work / "patch.edg.xml"
        patch.write_text("<edges>\n" + "\n".join(lane_rows) + "\n</edges>\n")
        args += ["-e", patch]
    if tls_set or tls_unset:
        rows = [f'  <node id="{j}" type="traffic_light"/>' for j in sorted(tls_set)]
        rows += [f'  <node id="{j}" type="priority"/>' for j in sorted(tls_unset)]
        patch = work / "patch.nod.xml"
        patch.write_text("<nodes>\n" + "\n".join(rows) + "\n</nodes>\n")
        args += ["-n", patch]
    _run(args)

    return {
        "removed_edges": len(removed),
        "affected_ways": affected_ways,
        "lane_edges": len(lane_rows),
        "signals_added": len(tls_set),
        "signals_removed": len(tls_unset),
        "skipped": skipped,
    }
