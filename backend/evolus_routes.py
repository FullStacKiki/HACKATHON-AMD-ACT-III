"""POST /api/questions and POST /api/briefing: the two Evolus agents.
If Evolus fails (not configured, unreachable, or an answer that is still not valid JSON after one retry), the example answer is returned
with example_data=true so the frontend shows its "Example data" banner."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from backend import evolus
from backend.examples import EXAMPLE_BRIEFING, EXAMPLE_QUESTIONS

log = logging.getLogger("evolus")
router = APIRouter(prefix="/api", tags=["evolus"])

FALLBACK_NOTICE = "Evolus is not available right now: this is example data."


class QuestionsRequest(BaseModel):
    pitch: str
    audience: str | None = None
    category: str | None = None
    price: float | None = None


@router.post("/questions")
async def questions(req: QuestionsRequest):
    """The pitch goes to the "US Survey Question Designer" agent; the answer is the array of survey questions."""
    if not req.pitch.strip():
        raise HTTPException(status_code=400, detail="The pitch cannot be empty")
    lines = [f"Product idea or pitch: {req.pitch.strip()}"]
    if req.audience:
        lines.append(f"Target audience: {req.audience.strip()}")
    if req.category:
        lines.append(f"Category: {req.category.strip()}")
    if req.price is not None:
        lines.append(f"Price: {req.price:g} US dollars")
    try:
        data = await evolus.ask_json("EVOLUS_WORKFLOW_QUESTIONS_ID", "\n".join(lines), evolus.validate_questions, complete=bool(req.audience and req.category and req.price is not None))
        return {"questions": data, "example_data": False, "source": "evolus", "workspace": evolus.workspace_name()}
    except evolus.MissingInput as e:
        raise HTTPException(status_code=422, detail={"error": "missing_input", "missing": e.missing})
    except evolus.EvolusError as e:
        log.warning("/api/questions: falling back to example data (%s)", e)
        return {"questions": EXAMPLE_QUESTIONS, "example_data": True, "source": "example", "notice": FALLBACK_NOTICE, "workspace": evolus.workspace_name()}


class BriefingRequest(BaseModel):
    """The panel results, in the shape of the frontend's API payload (lib/apiShape.js)."""
    model_config = ConfigDict(extra="allow")
    idea: str | None = None
    audience: str | None = None
    reactions: dict | None = None
    buyInterval: dict | None = None
    segments: dict | None = None
    wtp: list[dict] | None = None
    objections: list[dict] | None = None
    competitors: list[dict] | None = None
    example_data: bool = False


def _agent_input(req: BriefingRequest, best: float | int | None) -> str:
    """The JSON the "Consumer Panel Briefing" agent expects. Numbers are passed as they are; the agent is told not to calculate."""
    buy = (req.reactions or {}).get("buy")
    data = {
        "idea": req.idea,
        "target_audience": req.audience,
        "would_buy_share": buy,
        "uncertainty_range": req.buyInterval,
        "segments": {g: [{"label": x.get("label"), "would_buy": x.get("value")} for x in rows] for g, rows in (req.segments or {}).items() if isinstance(rows, list)},
        "demand_curve": [{"price": p.get("price"), "would_buy_share": p.get("share")} for p in sorted(req.wtp or [], key=lambda p: p.get("price", 0))],
        "objections": sorted(req.objections or [], key=lambda o: -o.get("share", 0))[:5],
        "competitors": req.competitors,
        "example_data": req.example_data,
    }
    if best is not None:
        data["optimal_price"] = best
    return json.dumps({k: v for k, v in data.items() if v is not None}, separators=(",", ":"))


@router.post("/briefing")
async def briefing(req: BriefingRequest):
    """The panel results, with the revenue-maximizing price worked out here, go to the "Consumer Panel Briefing" agent; the answer is its JSON."""
    best = evolus.optimal_price([{"price": p.get("price"), "share": p.get("share")} for p in req.wtp or []])
    try:
        data = await evolus.ask_json("EVOLUS_WORKFLOW_BRIEFING_ID", _agent_input(req, best), evolus.validate_briefing)
        return {"briefing": data, "optimal_price": best, "example_data": req.example_data, "source": "evolus", "workspace": evolus.workspace_name()}
    except evolus.EvolusError as e:
        log.warning("/api/briefing: falling back to example data (%s)", e)
        return {"briefing": EXAMPLE_BRIEFING, "optimal_price": best, "example_data": True, "source": "example", "notice": FALLBACK_NOTICE, "workspace": evolus.workspace_name()}
