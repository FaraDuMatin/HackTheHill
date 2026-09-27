"""OSM bbox -> netconvert -> randomTrips -> SUMO -> metrics."""
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import sumo

SUMO_HOME = sumo.SUMO_HOME
os.environ.setdefault("SUMO_HOME", SUMO_HOME)
BIN = Path(sys.executable).parent
TOOLS = Path(SUMO_HOME) / "tools"


def _run(args):
    subprocess.run([str(a) for a in args], check=True, capture_output=True, text=True)


def build_net(osm_path, net_path):
    _run([
        BIN / "netconvert",
        "--osm-files", osm_path,
        "-o", net_path,
        "--geometry.remove", "--roundabouts.guess", "--ramps.guess",
        "--junctions.join", "--tls.guess-signals", "--tls.discard-simple", "--tls.join",
        "--keep-edges.by-vclass", "passenger", "--remove-edges.isolated",
        "--output.street-names", "--no-warnings",
    ])


def make_trips(net_path, trips_path, seed=42, end=3600, period=1.0):
    _run([
        sys.executable, TOOLS / "randomTrips.py",
        "-n", net_path, "-o", trips_path,
        "--seed", seed, "-e", end, "-p", period,
        "--fringe-factor", 5, "--min-distance", 300,
    ])


def run_sumo(net_path, trips_path, out_dir, seed=42, end=5400):
    out = Path(out_dir)
    tripinfo, summary = out / "tripinfo.xml", out / "summary.xml"
    _run([
        BIN / "sumo",
        "-n", net_path, "-r", trips_path,
        "--seed", seed, "--end", end,
        "--ignore-route-errors", "--no-step-log", "--no-warnings",
        "--time-to-teleport", 300,
        "--tripinfo-output", tripinfo,
        "--summary-output", summary,
    ])
    return metrics(tripinfo, summary)


def metrics(tripinfo_path, summary_path):
    trips = ET.parse(tripinfo_path).getroot().findall("tripinfo")
    steps = ET.parse(summary_path).getroot().findall("step")
    last = steps[-1].attrib
    arrived = len(trips)
    loaded = int(last["loaded"])
    halting = [int(s.get("halting")) for s in steps]
    return {
        "vehicles_loaded": loaded,
        "throughput": arrived,
        "not_completed": loaded - arrived,
        "avg_travel_time_s": round(sum(float(t.get("duration")) for t in trips) / arrived, 1) if arrived else None,
        "total_delay_s": round(sum(float(t.get("timeLoss")) for t in trips), 1),
        "max_queue_vehicles": max(halting),
        "avg_queue_vehicles": round(sum(halting) / len(halting), 1),
    }
