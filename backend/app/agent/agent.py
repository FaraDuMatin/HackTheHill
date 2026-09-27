"""LLM agent that edits the scenario through tool calls (local model via Ollama).

The model only sees road names. Tools resolve names to OSM ways / intersections
(places.py) and return *actions* the frontend applies to its edit list, so every
AI edit is visible and reversible like a manual one.
"""
import json
import os
import urllib.request
import uuid

from .places import places

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:4b")
MAX_STEPS = 8
TIMEOUT_S = 180
AREA_KM = 1.5  # default half-size of an area selected by the agent

SYSTEM = """You edit a traffic sandbox map of Ottawa-Gatineau using tools.
Rules:
- Use tools for every change. Never claim a change you did not make with a tool.
- Pass road names exactly as the user wrote them. Tools find the roads.
- If a tool says a name is ambiguous or not found, ask the user a short question. Do not guess.
- A simulation needs an area. If none is selected and the user wants to simulate, select an area around the place they talk about first.
- Reply in 1-2 short sentences, in the user's language (English or French)."""


def _fn(name, description, props=None, required=None):
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": props or {}, "required": required or []},
    }}


ROAD = {"type": "string", "description": "Road name, e.g. 'Portage Bridge' or 'Rue Laurier'"}
TOOLS = [
    _fn("block_road", "Close a road to traffic.", {"road": ROAD}, ["road"]),
    _fn("unblock_road", "Reopen a road closed earlier.", {"road": ROAD}, ["road"]),
    _fn("set_lanes", "Set the total number of lanes of a road.",
        {"road": ROAD, "lanes": {"type": "integer", "description": "Total lanes, 1-8"}}, ["road", "lanes"]),
    _fn("add_signal", "Add a traffic light where two roads cross.",
        {"road_a": ROAD, "road_b": ROAD}, ["road_a", "road_b"]),
    _fn("remove_signal", "Remove the traffic light where two roads cross.",
        {"road_a": ROAD, "road_b": ROAD}, ["road_a", "road_b"]),
    _fn("move_signal", "Move a traffic light from one intersection to another.",
        {"from_road_a": ROAD, "from_road_b": ROAD, "to_road_a": ROAD, "to_road_b": ROAD},
        ["from_road_a", "from_road_b", "to_road_a", "to_road_b"]),
    _fn("select_area", "Select the area to simulate, centred on a road or on an intersection 'Road A & Road B'.",
        {"place": {"type": "string"}, "radius_km": {"type": "number", "description": "Half-size in km (default 1.5, max 2.5)"}},
        ["place"]),
    _fn("run_simulation", "Run the before/after traffic simulation on the selected area."),
]


class _Ctx:
    def __init__(self, bbox):
        self.bbox = bbox
        self.actions = []


def _point(place, bbox):
    P = places()
    for sep in ("&", " and ", " et ", "/"):
        if sep in place:
            a, b = place.split(sep, 1)
            return P.intersection(a.strip(), b.strip(), bbox)
    return P.road_center(P.find_road(place, bbox)[1])


def _run_tool(name, args, ctx):
    """Execute one tool call. Returns the text result for the model."""
    P = places()
    edit = lambda e: ctx.actions.append({"type": "edit", "edit": {**e, "by": "ai"}})

    if name in ("block_road", "unblock_road"):
        road, ways = P.find_road(args["road"], ctx.bbox)
        edit({"type": name, "wayIds": ways, "name": road})
        return f"{'Blocked' if name == 'block_road' else 'Reopened'} {road}."
    if name == "set_lanes":
        lanes = int(args["lanes"])
        if not 1 <= lanes <= 8:
            return "Lanes must be between 1 and 8."
        road, ways = P.find_road(args["road"], ctx.bbox)
        edit({"type": "set_lanes", "wayIds": ways, "name": road, "lanes": lanes})
        return f"{road} set to {lanes} lanes."
    if name == "add_signal":
        at = P.intersection(args["road_a"], args["road_b"], ctx.bbox)
        if P.signal_at(at):
            return "There is already a traffic light there."
        edit({"type": "add_signal", "key": f"new:{uuid.uuid4()}", "at": list(at)})
        return "Traffic light added."
    if name == "remove_signal":
        at = P.intersection(args["road_a"], args["road_b"], ctx.bbox)
        hit = P.signal_at(at)
        if not hit:
            return "There is no traffic light at that intersection."
        edit({"type": "remove_signal", "key": hit[0], "at": hit[1]})
        return "Traffic light removed."
    if name == "move_signal":
        src = P.intersection(args["from_road_a"], args["from_road_b"], ctx.bbox)
        dst = P.intersection(args["to_road_a"], args["to_road_b"], ctx.bbox)
        hit = P.signal_at(src)
        if not hit:
            return "There is no traffic light at the first intersection."
        edit({"type": "move_signal", "key": hit[0], "from": hit[1], "to": list(dst)})
        return "Traffic light moved."
    if name == "select_area":
        lng, lat = _point(args["place"], None)
        r = min(float(args.get("radius_km") or AREA_KM), 2.5)
        dlat, dlng = r / 111.32, r / (111.32 * 0.7)  # cos(45.4°) ≈ 0.7
        ctx.bbox = [lng - dlng, lat - dlat, lng + dlng, lat + dlat]
        ctx.actions.append({"type": "select_area", "bbox": ctx.bbox})
        return f"Selected a {2 * r:.1f} km area around {args['place']}."
    if name == "run_simulation":
        if not ctx.bbox:
            return "No area selected. Select an area first."
        ctx.actions.append({"type": "run_simulation"})
        return "Simulation started. Results will appear in the side panel."
    return f"Unknown tool {name}."


def _chat(messages):
    body = json.dumps({
        "model": MODEL, "messages": messages, "tools": TOOLS, "stream": False, "think": False,
        "options": {"temperature": 0.1},
    }).encode()
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read())["message"]


def run_agent(message, history, bbox, edits):
    """history: [{role, content}] of earlier user/assistant turns. Returns reply + actions."""
    ctx = _Ctx(bbox)
    state = f"Selected area: {'yes' if bbox else 'none'}. Current edits: {'; '.join(edits) or 'none'}."
    messages = [{"role": "system", "content": SYSTEM + "\n\n" + state}, *history[-10:], {"role": "user", "content": message}]

    for _ in range(MAX_STEPS):
        reply = _chat(messages)
        calls = reply.get("tool_calls") or []
        messages.append(reply)
        if not calls:
            return {"reply": reply.get("content", "").strip(), "actions": ctx.actions}
        for call in calls:
            fn = call["function"]
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                args = json.loads(args or "{}")
            try:
                result = _run_tool(fn["name"], args, ctx)
            except LookupError as e:
                result = str(e)
            except (KeyError, ValueError) as e:
                result = f"Bad arguments: {e}"
            messages.append({"role": "tool", "tool_name": fn["name"], "content": result})
    return {"reply": "I stopped after too many steps. Please rephrase.", "actions": ctx.actions}
