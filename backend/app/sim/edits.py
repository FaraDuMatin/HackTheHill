"""Apply a scenario (folded edit state) to a base SUMO network via netconvert.

scenario = {
    "blocked": [osm_way_id, ...],
    "lanes": {osm_way_id: total_lanes, ...},
    "signals_added": [[lng, lat], ...],
    "signals_removed": [[lng, lat], ...],
}
"""
import math
from collections import defaultdict
from pathlib import Path

import sumolib

from .pipeline import BIN, _run

SNAP_M = 40  # max distance from a clicked point to a SUMO junction


def _edges_by_way(net):
    by_way = defaultdict(list)
    for edge in net.getEdges():
        orig = edge.getLanes()[0].getParam("origId") or ""
        for way in orig.split():
            by_way[way.lstrip("-")].append(edge)
    return by_way


def _nearest_junction(net, lng, lat, signalized):
    x, y = net.convertLonLat2XY(lng, lat)
    best, best_d = None, SNAP_M
    for node in net.getNodes():
        if (node.getType() == "traffic_light") != signalized:
            continue
        nx, ny = node.getCoord()
        d = math.hypot(nx - x, ny - y)
        if d < best_d:
            best, best_d = node, d
    return best


def apply_scenario(base_net, scenario, out_net):
    """Write out_net = base_net + scenario. Returns what was applied."""
    net = sumolib.net.readNet(str(base_net), withInternal=False)
    by_way = _edges_by_way(net)
    work = Path(out_net).parent

    removed = sorted({e.getID() for w in scenario.get("blocked", []) for e in by_way.get(str(w), [])})

    lane_rows = []
    for way, total in scenario.get("lanes", {}).items():
        edges = by_way.get(str(way), [])
        two_way = any(e.getID().startswith("-") for e in edges) and any(not e.getID().startswith("-") for e in edges)
        per_dir = max(1, int(total) // 2) if two_way else max(1, int(total))
        lane_rows += [f'  <edge id="{e.getID()}" numLanes="{per_dir}"/>' for e in edges if e.getID() not in removed]

    tls_set = {j.getID() for p in scenario.get("signals_added", []) if (j := _nearest_junction(net, *p, False))}
    tls_unset = {j.getID() for p in scenario.get("signals_removed", []) if (j := _nearest_junction(net, *p, True))}

    args = [BIN / "netconvert", "-s", base_net, "-o", out_net, "--no-warnings"]
    if removed:
        args += ["--remove-edges.explicit", ",".join(removed)]
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
        "removed_edges": removed,
        "lane_edges": len(lane_rows),
        "tls_set": sorted(tls_set),
        "tls_unset": sorted(tls_unset),
    }
