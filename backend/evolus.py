"""Client for the Evolus agents used by /api/questions and /api/briefing.

The Evolus REST API (base https://api.evolus.ai/api/v1, headers X-ApiKey and X-Application-Id) has no "ask an agent" route.
What it documents is running a workflow, so each agent sits in a workflow with one AgentCall step:
  POST /workflows/{id}/execute             202 {executionId}      form field `parameters` = JSON object of execution parameters
  GET  /workflows/{id}/executions/{execId}                        status Completed | Failed, the agent answer in stepOutputs
An execution parameter holds 500 characters at most, so the input is cut into parts c1..c16 and the step prompt joins them back.

Keys come from backend/.env only. Nothing here logs a key, a header or an agent input.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("evolus")

BASE_URL = os.getenv("EVOLUS_BASE_URL", "https://api.evolus.ai/api/v1").rstrip("/")
PART_SIZE = 480          # characters per execution parameter (Evolus allows 500)
MAX_PARTS = 16
POLL_SECONDS = 1.5
TIMEOUT_SECONDS = 90.0


class EvolusError(Exception):
    """The Evolus call failed or its answer is not usable. The message never contains keys or inputs."""


class MissingInput(Exception):
    """The agent says the request lacks a field (it answered {"error": "missing_input", "missing": [...]})."""

    def __init__(self, missing: list[str]):
        super().__init__("missing_input")
        self.missing = missing


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def workspace_name() -> str | None:
    return _env("EVOLUS_WORKSPACE_NAME") or None


def configured(workflow_env: str) -> bool:
    return all(_env(n) for n in ("EVOLUS_API_KEY", "EVOLUS_APP_ID", workflow_env))


def _headers() -> dict[str, str]:
    return {"X-ApiKey": _env("EVOLUS_API_KEY"), "X-Application-Id": _env("EVOLUS_APP_ID")}


async def run_workflow(workflow_id: str, text: str) -> str:
    """Run the workflow with `text` as the agent input and return the agent's raw answer."""
    parts = [text[i:i + PART_SIZE] for i in range(0, len(text), PART_SIZE)]
    if not parts or len(parts) > MAX_PARTS:
        raise EvolusError("input is empty or too long for the workflow")
    params = {f"c{i + 1}": p for i, p in enumerate(parts)}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{BASE_URL}/workflows/{workflow_id}/execute", headers=_headers(), files={"parameters": (None, json.dumps(params))})
            if r.status_code != 202:
                raise EvolusError(f"execute returned HTTP {r.status_code}")
            execution_id = r.json()["executionId"]
            deadline = time.monotonic() + TIMEOUT_SECONDS
            while time.monotonic() < deadline:
                await asyncio.sleep(POLL_SECONDS)
                g = await client.get(f"{BASE_URL}/workflows/{workflow_id}/executions/{execution_id}", headers=_headers())
                if g.status_code != 200:
                    raise EvolusError(f"execution status returned HTTP {g.status_code}")
                body = g.json()
                status = str(body.get("status"))
                if status == "Completed":
                    outputs = body.get("stepOutputs") or {}
                    ordered = [outputs[k] for k in sorted(outputs, key=lambda k: int(k) if str(k).isdigit() else 0)]
                    answer = next((o for o in reversed(ordered) if isinstance(o, str) and o.strip()), None) or body.get("output")
                    if not answer:
                        raise EvolusError("the agent returned no answer")
                    return answer
                if status in ("Failed", "Cancelled", "Canceled"):
                    raise EvolusError(f"agent run {status.lower()}")  # the platform's error text can quote the prompt: not passed on
            raise EvolusError("the agent did not answer in time")
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise EvolusError(f"Evolus request failed ({type(e).__name__})") from e


_FENCE = re.compile(r"```(?:json|JSON)?\s*(.*?)```", re.DOTALL)


def parse_json(raw: str) -> Any:
    """Take the JSON out of an answer: strip code fences and any text around it, then parse."""
    text = raw.strip()
    m = _FENCE.search(text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    starts = [i for i in (text.find("["), text.find("{")) if i != -1]
    if starts:
        start = min(starts)
        end = max(text.rfind("]"), text.rfind("}"))
        if end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    raise ValueError("the answer is not valid JSON")


async def ask_json(workflow_env: str, text: str, validate: Callable[[Any], Any], complete: bool = False) -> Any:
    """Run the agent, parse and validate its JSON; if that fails, try once more. Raises EvolusError, or MissingInput.
    complete=True means the caller sent every input the agent needs: a "missing_input" answer is then a mistake of the model, so it is retried."""
    workflow_id = _env(workflow_env)
    if not configured(workflow_env):
        raise EvolusError("Evolus is not configured")
    last: Exception = EvolusError("no attempt")
    for attempt in (1, 2):
        try:
            raw = await run_workflow(workflow_id, text)
            if os.getenv("EVOLUS_DEBUG"):
                log.warning("EVOLUS_DEBUG answer: %d chars, head=%r, tail=%r", len(raw), raw[:60], raw[-60:])
            data = parse_json(raw)
            if isinstance(data, dict) and data.get("error") == "missing_input":
                if not complete:
                    raise MissingInput([str(x) for x in data.get("missing", [])])
                raise ValueError("the agent reported missing input although it was all sent")
            return validate(data)
        except MissingInput:
            raise
        except (EvolusError, ValueError) as e:
            last = e
            log.warning("Evolus attempt %d failed: %s", attempt, e)
    raise EvolusError(str(last))


# ---- Validation of what each agent must return --------------------------------------------------------------------

def _unwrap(data: Any, keys: tuple[str, ...]) -> Any:
    """The model sometimes wraps the answer in one more object ({"questions": [...]}): take what is inside."""
    if isinstance(data, dict) and len(data) == 1:
        inner = data.get(next(iter(data)))
        if next(iter(data)) in keys and inner is not None:
            return inner
    return data


def validate_questions(data: Any) -> list[dict]:
    data = _unwrap(data, ("questions", "items", "data"))
    if not isinstance(data, list) or not 10 <= len(data) <= 14:
        raise ValueError("expected an array of 10 to 14 questions")
    for q in data:
        if not isinstance(q, dict) or not all(k in q for k in ("id", "type", "text", "options")):
            raise ValueError("a question lacks id, type, text or options")
        if not isinstance(q["text"], str) or not isinstance(q["options"], list) or len(q["options"]) < 2:
            raise ValueError("a question has no usable text or options")
    return data


BRIEFING_KEYS = {"verdict", "who_buys", "price", "objections", "competitors", "next_steps", "caveats"}


def validate_briefing(data: Any) -> dict:
    data = _unwrap(data, ("briefing", "data"))
    if not isinstance(data, dict) or set(data) != BRIEFING_KEYS:
        raise ValueError("expected an object with exactly the briefing keys")
    for k in ("verdict", "who_buys", "price"):
        if not isinstance(data[k], str) or not data[k].strip():
            raise ValueError(f"{k} must be text")
    for k in ("objections", "competitors", "next_steps"):
        if not isinstance(data[k], list):
            raise ValueError(f"{k} must be a list")
    if len(data["next_steps"]) != 3:
        raise ValueError("next_steps must have exactly three items")
    return data


def optimal_price(curve: list[dict]) -> float | int | None:
    """The price that maximises price x share of buyers on the demand curve (the lowest price on a tie). None if the curve is unusable."""
    best = None
    for p in curve or []:
        try:
            price, share = float(p["price"]), float(p["share"])
        except (KeyError, TypeError, ValueError):
            continue
        if best is None or price * share > best[0] * best[1] or (price * share == best[0] * best[1] and price < best[0]):
            best = (price, share)
    if best is None:
        return None
    return int(best[0]) if best[0].is_integer() else best[0]
