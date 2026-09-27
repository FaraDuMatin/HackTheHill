"""Step 2 spike: run the full pipeline on the Portage Bridge area.

Run from backend/:  .venv/Scripts/python -m app.sim.spike
"""
import json
import time

from .extract import DATA, extract_bbox
from .pipeline import build_net, make_trips, run_sumo

PORTAGE_BBOX = (-75.74, 45.405, -75.69, 45.44)  # west, south, east, north


def main():
    out = DATA / "runs" / "portage"
    out.mkdir(parents=True, exist_ok=True)
    osm, net, trips = out / "area.osm", out / "area.net.xml", out / "trips.xml"

    t = time.time()
    extract_bbox(PORTAGE_BBOX, str(osm))
    print(f"extract   {time.time() - t:.1f}s")
    t = time.time()
    build_net(osm, net)
    print(f"netconvert {time.time() - t:.1f}s")
    t = time.time()
    make_trips(net, trips)
    print(f"trips     {time.time() - t:.1f}s")
    t = time.time()
    m = run_sumo(net, trips, out)
    print(f"sumo      {time.time() - t:.1f}s")
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()
