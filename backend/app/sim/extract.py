"""Cut a bbox of drivable roads out of the OSM extract."""
from pathlib import Path

import osmium

DATA = Path(__file__).resolve().parents[3] / "data"
BASE_PBF = str(DATA / "ottawa.osm.pbf")


def extract_bbox(bbox, out_path, src=BASE_PBF):
    """bbox = (west, south, east, north). Writes OSM XML for netconvert."""
    west, south, east, north = bbox

    def inside(loc):
        return loc.valid() and west <= loc.lon <= east and south <= loc.lat <= north

    with osmium.BackReferenceWriter(out_path, ref_src=src, overwrite=True, remove_tags=False) as writer:
        fp = osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY).with_locations()
        for way in fp:
            if way.is_way() and "highway" in way.tags and any(inside(n.location) for n in way.nodes):
                writer.add_way(way)
