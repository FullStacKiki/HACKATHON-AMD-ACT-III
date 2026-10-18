"""Client for the AMD Token Factory (OpenAI-compatible chat completions): the model that plays one survey respondent.
Settings come from backend/.env (TOKEN_FACTORY_BASE_URL, TOKEN_FACTORY_API_KEY, TOKEN_FACTORY_MODEL). Nothing here logs a key or a prompt."""
from __future__ import annotations

import asyncio
import logging
import os
import random
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("token_factory")

MAX_RETRIES = 6


class TokenFactoryError(Exception):
    """The call failed for good. The message never contains the key or the prompt."""


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def configured() -> bool:
    return all(_env(n) for n in ("TOKEN_FACTORY_BASE_URL", "TOKEN_FACTORY_API_KEY", "TOKEN_FACTORY_MODEL"))


def model_name() -> str:
    return _env("TOKEN_FACTORY_MODEL")


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0))


async def chat(client: httpx.AsyncClient, system: str, user: str, *, max_tokens: int = 400, temperature: float = 0.8) -> str:
    """One chat completion. A 429 (and a 5xx or a network error) is retried with exponential backoff and jitter, honouring Retry-After."""
    if not configured():
        raise TokenFactoryError("Token Factory is not configured")
    url = _env("TOKEN_FACTORY_BASE_URL").rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {_env('TOKEN_FACTORY_API_KEY')}", "Content-Type": "application/json"}
    body = {"model": _env("TOKEN_FACTORY_MODEL"), "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "max_tokens": max_tokens, "temperature": temperature}
    last = "no attempt"
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as e:
            last = f"network error ({type(e).__name__})"
        else:
            if r.status_code == 200:
                try:
                    return r.json()["choices"][0]["message"]["content"] or ""
                except (KeyError, IndexError, ValueError):
                    raise TokenFactoryError("unexpected response shape")
            last = f"HTTP {r.status_code}"
            if r.status_code not in (429, 500, 502, 503, 504):
                raise TokenFactoryError(last)
            retry_after = r.headers.get("Retry-After")
            if retry_after and retry_after.replace(".", "", 1).isdigit():
                await asyncio.sleep(min(60.0, float(retry_after)))
                continue
        if attempt < MAX_RETRIES:
            delay = min(30.0, 2.0 ** attempt) * (0.75 + random.random() * 0.5)
            log.warning("Token Factory %s, retry %d in %.1fs", last, attempt + 1, delay)
            await asyncio.sleep(delay)
    raise TokenFactoryError(f"gave up after {MAX_RETRIES} retries ({last})")
