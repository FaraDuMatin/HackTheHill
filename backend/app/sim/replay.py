"""Compact vehicle trajectories for the map replay, built from SUMO FCD output.

Format (gzipped JSON):
{
  "period": 5,          # seconds between samples
  "end": 5400,          # last sample time
  "vehicles": [[first, xs, ys, speeds], ...]
}
first  = index of the vehicle's first sample (time = first * period)
xs, ys = lng/lat * 1e5 as ints, delta-encoded (first value absolute)
speeds = km/h ints
"""
import gzip
import json
import xml.etree.ElementTree as ET

FCD_PERIOD = 5
SCALE = 1e5


def build_replay(fcd_path, out_path):
    tracks = {}  # vehicle id -> [first, xs, ys, speeds]
    end = 0
    for _, el in ET.iterparse(fcd_path, events=("end",)):
        if el.tag != "timestep":
            continue
        t = float(el.get("time"))
        step = round(t / FCD_PERIOD)
        end = t
        for v in el.iter("vehicle"):
            x, y = round(float(v.get("x")) * SCALE), round(float(v.get("y")) * SCALE)
            speed = round(float(v.get("speed")) * 3.6)
            tr = tracks.get(v.get("id"))
            if tr is None:
                tracks[v.get("id")] = [step, [x], [y], [speed], x, y]
                continue
            # Keep samples contiguous: a vehicle missing for some steps (e.g. while
            # teleporting) holds its last position.
            while tr[0] + len(tr[1]) < step:
                tr[1].append(0)
                tr[2].append(0)
                tr[3].append(0)
            # Delta-encode against the previous absolute position (kept in tr[4:6]).
            tr[1].append(x - tr[4])
            tr[2].append(y - tr[5])
            tr[3].append(speed)
            tr[4], tr[5] = x, y
        el.clear()

    data = {"period": FCD_PERIOD, "end": end, "vehicles": [tr[:4] for tr in tracks.values()]}
    with gzip.open(out_path, "wt") as f:
        json.dump(data, f, separators=(",", ":"))
