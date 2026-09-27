"""Background simulation jobs: baseline vs scenario on a selected area.

Per area (bbox), the network, demand and baseline result are built once and
cached in data/areas/<key>/. Each job gets its own data/runs/<job id>/.
"""
import json
import math
import shutil
import threading
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from .edits import apply_scenario
from .extract import DATA, build_roads_pbf, extract_bbox
from .pipeline import SimError, build_net, filter_trips, make_trips, run_sumo

MAX_AREA_KM2 = 25
# Bump when the network/demand pipeline changes so cached areas are rebuilt.
CACHE_VERSION = 4
AREAS = DATA / "areas"
RUNS = DATA / "runs"

STAGES = ["Extract roads", "Build network", "Generate traffic", "Apply edits", "Simulate baseline + scenario"]

_jobs = {}
_area_locks = defaultdict(threading.Lock)


def area_km2(bbox):
    west, south, east, north = bbox
    k = math.cos(math.radians((south + north) / 2))
    return (east - west) * k * 111.32 * (north - south) * 111.32


def validate_bbox(bbox):
    if len(bbox) != 4 or not (bbox[0] < bbox[2] and bbox[1] < bbox[3]):
        return "Invalid area"
    if area_km2(bbox) > MAX_AREA_KM2:
        return f"Area is {area_km2(bbox):.0f} km². Max is {MAX_AREA_KM2} km²."
    return None


def _area_key(bbox):
    return f"v{CACHE_VERSION}_" + "_".join(f"{v:.4f}" for v in bbox).replace("-", "m").replace(".", "p")


def _is_empty(scenario):
    return not any(scenario.get(k) for k in ("blocked", "lanes", "signals_added", "signals_removed"))


def start(bbox, scenario):
    job = {"id": uuid.uuid4().hex[:12], "status": "running", "stage": 0, "stages": STAGES,
           "started": time.time(), "result": None, "error": None}
    _jobs[job["id"]] = job
    threading.Thread(target=_run, args=(job, bbox, scenario), daemon=True).start()
    return job["id"]


def status(job_id):
    job = _jobs.get(job_id)
    if job is None:
        return None
    public = {k: v for k, v in job.items() if k not in ("started", "replay")}
    return {**public, "elapsed_s": round(time.time() - job["started"], 1)}


def replay_path(job_id, which):
    job = _jobs.get(job_id)
    return (job.get("replay") or {}).get(which) if job else None


def _run(job, bbox, scenario):
    try:
        key = _area_key(bbox)
        area = AREAS / key
        osm, base, trips = area / "area.osm", area / "base.net.xml", area / "trips.xml"
        baseline_json = area / "baseline.json"
        baseline_replay = area / "baseline_replay.json.gz"

        # One build per area at a time; concurrent jobs on the same area wait here.
        with _area_locks[key]:
            area.mkdir(parents=True, exist_ok=True)
            job["stage"] = 0
            if not osm.exists():
                build_roads_pbf()
                extract_bbox(bbox, osm)
            job["stage"] = 1
            if not base.exists():
                build_net(osm, base)
            job["stage"] = 2
            if not trips.exists():
                make_trips(base, trips)

        run_dir = RUNS / job["id"]
        run_dir.mkdir(parents=True, exist_ok=True)
        job["stage"] = 3
        if _is_empty(scenario):
            applied, scenario_net = None, base
        else:
            scenario_net = run_dir / "scenario.net.xml"
            applied = apply_scenario(base, scenario, scenario_net)
            if not any(applied[k] for k in ("removed_edges", "lane_edges", "signals_added", "signals_removed")):
                scenario_net = base  # every edit was skipped: scenario == baseline
            else:
                scenario_trips = run_dir / "trips.xml"
                filter_trips(trips, scenario_net, scenario_trips)

        job["stage"] = 4
        with ThreadPoolExecutor(2) as pool:
            baseline_f = None
            if not baseline_json.exists():
                baseline_f = pool.submit(run_sumo, base, trips, run_dir / "baseline")
            scenario_f = None
            if scenario_net != base:
                scenario_f = pool.submit(run_sumo, scenario_net, scenario_trips, run_dir / "scenario", demand_path=trips)
            if baseline_f:
                with _area_locks[key]:
                    if not baseline_json.exists():
                        result = baseline_f.result()
                        shutil.copy(run_dir / "baseline" / "replay.json.gz", baseline_replay)
                        baseline_json.write_text(json.dumps(result))
            baseline = json.loads(baseline_json.read_text())
            result_scenario = scenario_f.result() if scenario_f else baseline

        job["replay"] = {
            "baseline": baseline_replay,
            "scenario": run_dir / "scenario" / "replay.json.gz" if scenario_f else baseline_replay,
        }
        job["result"] = {"baseline": baseline, "scenario": result_scenario, "applied": applied, "area_km2": round(area_km2(bbox), 1)}
        job["status"] = "done"
    except SimError as e:
        job["status"], job["error"] = "error", str(e)
    except Exception as e:  # surface anything unexpected to the UI instead of hanging
        job["status"], job["error"] = "error", f"Unexpected error: {e}"
