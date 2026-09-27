"""OSM bbox -> netconvert -> randomTrips -> SUMO -> metrics."""
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import sumo
import sumolib

SUMO_HOME = sumo.SUMO_HOME
os.environ.setdefault("SUMO_HOME", SUMO_HOME)
BIN = Path(sys.executable).parent
TOOLS = Path(SUMO_HOME) / "tools"

TIMEOUT_S = 300


class SimError(RuntimeError):
    pass


def _run(args, timeout=TIMEOUT_S):
    args = [str(a) for a in args]
    try:
        subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise SimError(f"{Path(args[0]).name} timed out after {timeout}s")
    except subprocess.CalledProcessError as e:
        raise SimError(f"{Path(args[0]).name} failed: {(e.stderr or '').strip()[-500:]}")


def build_net(osm_path, net_path):
    raw = Path(net_path).with_suffix(".raw.xml")
    _run([
        BIN / "netconvert",
        "--osm-files", osm_path,
        "-o", raw,
        # No --geometry.remove: it merges OSM ways into one edge, so blocking one road
        # would close a longer stretch than the user picked.
        "--roundabouts.guess", "--ramps.guess",
        "--junctions.join", "--tls.guess-signals", "--tls.discard-simple", "--tls.join",
        "--keep-edges.by-vclass", "passenger", "--remove-edges.isolated",
        "--output.street-names", "--output.original-names", "--no-warnings",
    ])
    # Re-reading a net with netconvert changes it once (then it is stable). Scenario nets
    # are made by re-reading the base, so normalize the base the same way: otherwise
    # baseline and scenario differ even with no edits.
    _run([BIN / "netconvert", "-s", raw, "-o", net_path, "--no-warnings"])


def lane_km(net_path):
    net = sumolib.net.readNet(str(net_path), withInternal=False)
    return sum(lane.getLength() for e in net.getEdges() for lane in e.getLanes()) / 1000


def make_trips(net_path, trips_path, seed=42, end=3600, density=10):
    """Random trips for one hour. density = vehicles/hour per lane-km, so demand
    scales with the network instead of flooding small areas."""
    period = 3600 / (lane_km(net_path) * density)
    _run([
        sys.executable, TOOLS / "randomTrips.py",
        "-n", net_path, "-o", trips_path,
        "--seed", seed, "-e", end, "-p", period,
        "--fringe-factor", 5, "--min-distance", 300,
    ])


def filter_trips(trips_path, net_path, out_path):
    """Drop trips that start or end on an edge missing from net_path (e.g. a blocked road).

    SUMO aborts on unknown edges, so these must go before the run; metrics() still
    counts them as not completed because it counts against the full demand file.
    """
    edges = {e.getID() for e in sumolib.net.readNet(str(net_path), withInternal=False).getEdges()}
    tree = ET.parse(trips_path)
    root = tree.getroot()
    for trip in root.findall("trip"):
        if trip.get("from") not in edges or trip.get("to") not in edges:
            root.remove(trip)
    tree.write(out_path)


def run_sumo(net_path, trips_path, out_dir, seed=42, end=5400, demand_path=None):
    """demand_path: full demand file to count trips against (defaults to trips_path)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tripinfo, summary, stats = out / "tripinfo.xml", out / "summary.xml", out / "stats.xml"
    _run([
        BIN / "sumo",
        "-n", net_path, "-r", trips_path,
        "--seed", seed, "--end", end,
        "--ignore-route-errors", "--no-step-log", "--no-warnings", "--threads", 4,
        "--time-to-teleport", 300,
        "--tripinfo-output", tripinfo,
        "--summary-output", summary,
        "--statistic-output", stats,
    ])
    return metrics(demand_path or trips_path, tripinfo, summary, stats)


def metrics(trips_path, tripinfo_path, summary_path, stats_path):
    # Count against the demand file, not what SUMO loaded: trips whose start or end
    # edge was removed by an edit are filtered out before the run but still "not completed".
    total = len(ET.parse(trips_path).getroot().findall("trip"))
    trips = ET.parse(tripinfo_path).getroot().findall("tripinfo")
    steps = ET.parse(summary_path).getroot().findall("step")
    teleports = ET.parse(stats_path).getroot().find("teleports")
    arrived = len(trips)
    halting = [int(s.get("halting")) for s in steps] or [0]
    return {
        "trips": total,
        "throughput": arrived,
        "not_completed": total - arrived,
        "avg_travel_time_s": round(sum(float(t.get("duration")) for t in trips) / arrived, 1) if arrived else None,
        "total_delay_s": round(sum(float(t.get("timeLoss")) for t in trips), 1),
        "max_queue_vehicles": max(halting),
        "avg_queue_vehicles": round(sum(halting) / len(halting), 1),
        "teleports": int(teleports.get("total")) if teleports is not None else 0,
    }
