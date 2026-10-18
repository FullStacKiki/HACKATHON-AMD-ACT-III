"""POST /api/panel starts a panel run in the background (it takes minutes); GET /api/panel/{jobId} reports progress and, when done, the result.
If the run fails for any reason (Evolus or Token Factory down, too few answers, no Twin profiles) the job still ends "done" but with
example_data=true and no result: the frontend then shows its own example data under the "Example data" banner."""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend import panel

log = logging.getLogger("panel")
router = APIRouter(prefix="/api", tags=["panel"])
JOBS: dict[str, dict] = {}
KEEP_JOBS = 20
FALLBACK_NOTICE = "The panel could not be run right now: this is example data."


class PanelRequest(BaseModel):
    pitch: str
    audience: str | None = None
    category: str | None = None
    price: float | None = None
    n: int = Field(default=int(os.getenv("PANEL_PEOPLE", "100")), ge=5, le=300)  # 100 respondents unless PANEL_PEOPLE says otherwise
    seed: int = 7


async def _run(job_id: str, req: PanelRequest) -> None:
    job = JOBS[job_id]

    def progress(done: int, total: int) -> None:
        job["progress"] = {"done": done, "total": total}

    try:
        job["result"] = await panel.run_panel(req.pitch, req.audience, req.category, req.price, req.n, req.seed, progress)
        job.update(status="done", example_data=False)
    except Exception as e:  # any failure falls back to example data; the message holds no keys or prompts
        log.warning("panel run failed, falling back to example data: %s", e)
        job.update(status="done", example_data=True, notice=FALLBACK_NOTICE, result=None)


@router.post("/panel", status_code=202)
async def start_panel(req: PanelRequest):
    if not req.pitch.strip():
        raise HTTPException(status_code=400, detail="The pitch cannot be empty")
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "running", "progress": {"done": 0, "total": req.n}, "started": time.time(), "example_data": False, "result": None}
    for old in sorted(JOBS, key=lambda k: JOBS[k]["started"])[:-KEEP_JOBS]:
        JOBS.pop(old, None)
    asyncio.create_task(_run(job_id, req))
    return {"jobId": job_id, "status": "running"}


@router.get("/panel/{job_id}")
async def panel_status(job_id: str):
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    return {k: v for k, v in job.items() if k != "started"}
