import threading

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .sim import runner
from .sim.extract import nearest_junction

SNAP_M = 30

app = FastAPI()


@app.on_event("startup")
def warm_up():
    # Build the roads-only extract and intersection index before the first request needs them.
    threading.Thread(target=lambda: nearest_junction(0, 0, 0), daemon=True).start()


@app.get("/api/health")
def health():
    return {"ok": True}


class SimulateRequest(BaseModel):
    bbox: list[float]  # west, south, east, north
    scenario: dict


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    error = runner.validate_bbox(req.bbox)
    if error:
        raise HTTPException(400, error)
    return {"job_id": runner.start(req.bbox, req.scenario)}


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    s = runner.status(job_id)
    if s is None:
        raise HTTPException(404, "Unknown job")
    return s


@app.get("/api/snap")
def snap(lng: float, lat: float):
    """Nearest road intersection within SNAP_M, or null."""
    at = nearest_junction(lng, lat, SNAP_M)
    return {"at": list(at) if at else None}
