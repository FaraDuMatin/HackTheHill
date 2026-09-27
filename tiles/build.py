"""Build frontend/public/tiles/ottawa.pmtiles from OSM.

Run from repo root:  backend/.venv/Scripts/python tiles/build.py
Needs Java 21+.
"""
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

import osmium

from signals import build_signals

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BBOX = (45.21, -75.95, 45.532, -75.4)  # south, west, north, east (extract bounds)
EXTRACT_URL = "https://download.bbbike.org/osm/bbbike/Ottawa/Ottawa.osm.pbf"
PLANETILER_URL = "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def download(url, path, data=None):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "HackTheHill-sandbox/0.1"})
    with urllib.request.urlopen(req) as r, open(path, "wb") as f:
        f.write(r.read())


def main():
    download(EXTRACT_URL, DATA / "ottawa.osm.pbf")
    download(PLANETILER_URL, ROOT / "tools" / "planetiler.jar")

    # The extract clips large water multipolygons (Ottawa River); fetch them whole.
    bbox = ",".join(map(str, BBOX))
    query = (
        f'[out:xml][timeout:170];(relation["natural"="water"]({bbox});'
        f'relation["waterway"="riverbank"]({bbox}););(._;>;);out body;'
    )
    download(OVERPASS_URL, DATA / "water.osm", urllib.parse.urlencode({"data": query}).encode())

    city = DATA / "city.osm.pbf"
    if not city.exists():
        merged = osmium.MergeInputReader()
        merged.add_file(str(DATA / "ottawa.osm.pbf"))
        merged.add_file(str(DATA / "water.osm"))
        writer = osmium.WriteHandler(str(city))
        merged.apply(writer)
        writer.close()

    subprocess.run([
        "java", "-jar", str(ROOT / "tools" / "planetiler.jar"), "generate-custom",
        f"--schema={ROOT / 'tiles' / 'roads.yml'}",
        f"--output={ROOT / 'frontend' / 'public' / 'tiles' / 'ottawa.pmtiles'}",
        "--maxzoom=14", "--force",
    ], check=True, cwd=ROOT)

    build_signals(city, ROOT / "frontend" / "public" / "tiles" / "signals.geojson", DATA / "signal_flags.geojson")


if __name__ == "__main__":
    main()
