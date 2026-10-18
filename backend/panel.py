"""The synthetic panel: 100 respondents sampled from Twin-2K-500 answer the survey designed by the Evolus agent, played by the Token Factory model.

    pitch + audience + category + price
      -> /api/questions agent (Evolus)          the survey: price questions at -40/-20/0/+20/+40%, likert questions, concern, ...
      -> sample N respondents from Twin         reduced profile: age, sex, education, family income, region
      -> one chat call per respondent           all questions at once, answer {"q1": "A", ...}; at most 5 calls at a time, retry on 429
      -> aggregate                              the payload the dashboard already reads (lib/apiShape.js), with bootstrap intervals

How the numbers are made (nothing here is invented, everything is counted from the answers):
  buy         "Yes" at the price of the pitch.   undecided: "No" at that price but "Yes" at a lower price asked.   no: the rest.
  wtp         share of "Yes" at every price asked.
  score       mean over respondents of the share of these that are positive: buy, and the top-2 of each likert question (interest, value for
              money, trust, recommend) that is present. 0-100.
  objections  the "main concern" answers of the respondents who would not buy, as a share of the whole panel.
  segments    share that would buy inside each age band, income group and party (groups of at least 5 respondents).
  intervals   bootstrap, 1,000 resamples of the respondents, 2.5th to 97.5th percentile.
The Twin data has the region of each respondent, not the state, so no persona list (map and feed) is returned.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from backend import evolus, token_factory

log = logging.getLogger("panel")
PROFILES_FILE = Path(__file__).resolve().parent / "panel_data" / "twin_profiles.json"
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
PARALLEL = 5
BOOTSTRAPS = 1000
MIN_OK = 0.7           # share of the respondents that must answer, or the run counts as failed
SYSTEM = ("You are a survey respondent. You are given your profile and a survey. Answer every question the way a person with this profile would, "
          "choosing the letter of exactly one option for each. Reply with JSON only, no other text, like {\"q1\":\"A\",\"q2\":\"C\"}.")
INCOME_GROUP = {"Less than $30,000": "Under $50k", "$30,000-$50,000": "Under $50k", "$50,000-$75,000": "$50-100k", "$75,000-$100,000": "$50-100k", "$100,000 or more": "Over $100k"}
INCOME_ORDER = ["Under $50k", "$50-100k", "Over $100k"]
NEG = re.compile(r"\b(not|never|poor|un[a-z]+|disagree|dissatisf\w*|low|bad|none|no)\b", re.I)


class PanelError(Exception):
    """The panel could not be completed (the caller then falls back to example data)."""


@dataclass
class Q:
    key: str
    type: str
    dimension: str
    price: float | None
    text: str
    options: list[str]


def load_profiles() -> list[dict]:
    try:
        return json.loads(PROFILES_FILE.read_text(encoding="utf-8"))["respondents"]
    except (OSError, ValueError, KeyError) as e:
        raise PanelError(f"Twin profiles not found ({PROFILES_FILE.name}): run scripts/BuildPanelProfiles.py") from e


def normalise(raw: list[dict]) -> list[Q]:
    out = []
    for i, q in enumerate(raw, 1):
        text = str(q.get("text", ""))
        price = q.get("price")
        if not isinstance(price, (int, float)):
            m = re.search(r"\$\s*([0-9]+(?:\.[0-9]+)?)", text) if str(q.get("type", "")).lower() == "price" else None
            price = float(m.group(1)) if m else None
        out.append(Q(f"q{i}", str(q.get("type", "")).lower(), str(q.get("dimension", "")).lower(), float(price) if price is not None else None, text, [str(o) for o in q["options"]]))
    if sum(1 for q in out if q.price is not None) < 3:
        raise PanelError("the survey has fewer than three price questions")
    return out


def sample(profiles: list[dict], n: int, seed: int) -> list[dict]:
    return random.Random(seed).sample(profiles, min(n, len(profiles)))


def profile_text(p: dict) -> str:  # the reduced profile of the training data
    return f"Age: {p['age']}; Sex: {p['sex']}; Education: {p['education']}; Family income: {p['income']}; Region: {p['region']}"


def survey_text(qs: list[Q]) -> str:
    return "\n".join(f"{q.key}. {q.text} Options: " + " ".join(f"{LETTERS[i]}) {o}" for i, o in enumerate(q.options)) for q in qs)


def parse_answers(raw: str, qs: list[Q]) -> dict[str, int] | None:
    """{"q1": "A", ...} -> {"q1": 0, ...}; None if fewer than 80% of the questions have a valid letter."""
    try:
        data = evolus.parse_json(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    ans = {}
    for q in qs:
        v = str(data.get(q.key, "")).strip().upper()
        if v and v[0] in LETTERS and LETTERS.index(v[0]) < len(q.options):
            ans[q.key] = LETTERS.index(v[0])
    return ans if len(ans) >= 0.8 * len(qs) else None


async def ask_respondent(client, sem: asyncio.Semaphore, p: dict, qs: list[Q], survey: str) -> dict[str, int] | None:
    user = f"Profile: {profile_text(p)}\n\nSurvey:\n{survey}"
    async with sem:
        for attempt in (1, 2):
            try:
                ans = parse_answers(await token_factory.chat(client, SYSTEM, user), qs)
            except token_factory.TokenFactoryError as e:
                log.warning("respondent call failed: %s", e)
                return None
            if ans is not None:
                return ans
        return None


# ---- Aggregation ----------------------------------------------------------------------------------------------------

def _yes(q: Q) -> int:
    return next((i for i, o in enumerate(q.options) if o.strip().lower().startswith("yes")), 0)


def _positive(options: list[str]) -> set[int] | None:
    """The two most positive options of a likert scale, from the words at its two ends; None if the direction is unclear."""
    first, last = bool(NEG.search(options[0])), bool(NEG.search(options[-1]))
    if first and not last:
        return {len(options) - 1, len(options) - 2}
    if last and not first:
        return {0, 1}
    return None


def _dimension(q: Q) -> str | None:
    t = f"{q.dimension} {q.text}".lower()
    for name, words in (("interest", ("interest",)), ("value", ("value",)), ("trust", ("trust",)), ("recommend", ("recommend",))):
        if any(w in t for w in words):
            return name
    return None


# ---- Post-stratification ------------------------------------------------------------------------------------------------

CENSUS_FILE = Path(__file__).resolve().parent / "data" / "census_targets.json"
WEIGHT_CAPS = (0.2, 5.0)
RAKE_ON = (("age", "age"), ("sex", "sex"), ("education", "education"), ("region", "region"))  # (target key, key in the Twin profile)


def load_targets() -> dict:
    try:
        return json.loads(CENSUS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise PanelError(f"Census targets not found ({CENSUS_FILE.name}): run scripts/BuildCensusTargets.py") from e


def rake(people: list[dict], census: dict) -> tuple[list[float], dict]:
    """Raking (iterative proportional fitting) of the respondents to the ACS shares of US adults by age band, sex, education and region.
    Weights are kept between 0.2 and 5 and normalised to a mean of 1. A category nobody in the panel belongs to cannot be reached: the targets
    of the other categories are rescaled to add up to 1 and the gap is reported. Returns the weights and a diagnosis (Kish effective size, fit)."""
    n = len(people)
    w = [1.0] * n
    margins = []
    for tkey, pkey in RAKE_ON:
        present = {p[pkey] for p in people}
        t = {c: v for c, v in census["targets"][tkey].items() if c in present}
        tot = sum(t.values())
        margins.append((tkey, pkey, {c: v / tot for c, v in t.items()}))
    for _ in range(100):  # trim, then rake again, until the weights no longer move
        for _ in range(200):
            moved = 0.0
            for _, pkey, t in margins:
                tot = sum(w)
                cat = {c: sum(wi for wi, p in zip(w, people) if p[pkey] == c) for c in t}
                f = {c: t[c] * tot / cat[c] for c in t}
                moved = max(moved, max(abs(f[c] - 1) for c in t))
                w = [wi * f[p[pkey]] for wi, p in zip(w, people)]
            if moved < 1e-9:
                break
        m = sum(w) / n
        clipped = [min(WEIGHT_CAPS[1], max(WEIGHT_CAPS[0], wi / m)) for wi in w]
        done = max(abs(a - wi / m) for a, wi in zip(clipped, w)) < 1e-9
        w = clipped
        if done:
            break
    m = sum(w) / n
    w = [wi / m for wi in w]
    tot = sum(w)
    fit, worst, missing = {}, 0.0, {}
    for tkey, pkey, _ in margins:
        got = {c: round(sum(wi for wi, p in zip(w, people) if p[pkey] == c) / tot, 4) for c in census["targets"][tkey]}
        fit[tkey] = {c: {"target": round(census["targets"][tkey][c], 4), "weighted": got[c], "unweighted": round(sum(1 for p in people if p[pkey] == c) / n, 4)} for c in got}
        worst = max(worst, max(abs(got[c] - census["targets"][tkey][c]) for c in got if any(p[pkey] == c for p in people)))
        missing[tkey] = [c for c in got if not any(p[pkey] == c for p in people)]
    return w, {
        "method": "raking (IPF) on age band, sex, education and region", "source": f"{census['source']} {census['year']}", "year": census["year"],
        "weightRange": [round(min(w), 2), round(max(w), 2)], "caps": list(WEIGHT_CAPS),
        "effectiveN": round(tot * tot / sum(wi * wi for wi in w), 1), "kish": "(sum of weights)^2 / sum of squared weights",
        "largestMarginGap": round(worst, 4), "categoriesNobodyIn": {k: v for k, v in missing.items() if v}, "fit": fit,
    }


# ---- Aggregation ----------------------------------------------------------------------------------------------------

def _ci(values: list[float], sets: list[list[int]], w: list[float]) -> tuple[float, float]:
    """Weighted bootstrap: resample the respondents (each keeps its weight) and take the weighted mean of every resample."""
    means = sorted(sum(w[i] * values[i] for i in s) / sum(w[i] for i in s) for s in sets)
    return round(100 * means[int(0.025 * len(means))], 1), round(100 * means[int(0.975 * len(means)) - 1], 1)


def aggregate(people: list[dict], answers: list[dict[str, int]], qs: list[Q], price: float | None, seed: int, runtime: float, requested: int,
              weights: list[float] | None = None) -> dict[str, Any]:
    n = len(people)
    w = weights or [1.0] * n

    def wmean(vals, idx=None):
        idx = range(n) if idx is None else idx
        tw = sum(w[i] for i in idx)
        return sum(w[i] * vals[i] for i in idx) / tw if tw else 0.0

    prices = sorted({q.price for q in qs if q.price is not None})
    pq = {q.price: q for q in qs if q.price is not None}
    base = min(prices, key=lambda p: abs(p - price)) if price is not None else prices[len(prices) // 2]
    yes_at = [{p: a.get(pq[p].key) == _yes(pq[p]) for p in prices if pq[p].key in a} for a in answers]
    buy = [1.0 if y.get(base) else 0.0 for y in yes_at]
    lower = [p for p in prices if p < base]
    undecided = [1.0 if (not b and any(y.get(p) for p in lower)) else 0.0 for b, y in zip(buy, yes_at)]

    # score: per respondent, the share of the positive signals he or she gave
    comps: list[list[float]] = [[b] for b in buy]
    used = ["buy"]
    for q in qs:
        dim = _dimension(q) if q.price is None and q.type in ("likert", "scale") or (q.price is None and len(q.options) == 5) else None
        pos = _positive(q.options) if dim else None
        if dim and pos:
            used.append(dim)
            for c, a in zip(comps, answers):
                if q.key in a:
                    c.append(1.0 if a[q.key] in pos else 0.0)
    score_i = [100 * sum(c) / len(c) for c in comps]

    rng = random.Random(seed)
    sets = [[rng.randrange(n) for _ in range(n)] for _ in range(BOOTSTRAPS)]
    score = round(wmean(score_i), 1)
    s_lo, s_hi = _ci([v / 100 for v in score_i], sets, w)
    b_lo, b_hi = _ci(buy, sets, w)

    wtp = []
    for p in prices:
        vals = [1.0 if y.get(p) else 0.0 for y in yes_at]
        lo, hi = _ci(vals, sets, w)
        wtp.append({"price": p, "share": round(100 * wmean(vals), 1), "low": lo, "high": hi})

    def seg_of(person: dict, group: str) -> str:
        return person["age"] if group == "age" else INCOME_GROUP.get(person["income"], person["income"]) if group == "income" else person["party"]

    segments, views = {}, [{"question": "Price", "segment": "Everyone", "points": wtp}]
    for group in ("age", "income", "politics"):
        labels = sorted({seg_of(p, group) for p in people}, key=lambda s: (INCOME_ORDER.index(s) if group == "income" and s in INCOME_ORDER else 0, s))
        rows = []
        for lab in labels:
            idx = [i for i, p in enumerate(people) if seg_of(p, group) == lab]
            if len(idx) >= 5:
                rows.append({"label": lab, "value": round(100 * wmean(buy, idx), 1), "n": len(idx)})
        segments[group] = rows
    for lab in sorted({p["age"] for p in people}):
        idx = [i for i, p in enumerate(people) if p["age"] == lab]
        if len(idx) >= 15:
            views.append({"question": "Price", "segment": lab, "points": [{"price": p, "share": round(100 * wmean([1.0 if y.get(p) else 0.0 for y in yes_at], idx), 1)} for p in prices]})

    concern = next((q for q in qs if q.price is None and "concern" in q.text.lower()), None)
    objections = []
    if concern:
        mass: dict[str, float] = {}
        for i, (b, a) in enumerate(zip(buy, answers)):
            if not b and concern.key in a:
                t = concern.options[a[concern.key]]
                mass[t] = mass.get(t, 0.0) + w[i]
        objections = [{"text": t, "share": round(100 * m / sum(w), 1)} for t, m in sorted(mass.items(), key=lambda kv: -kv[1])][:5]

    r_buy, r_und = round(100 * wmean(buy)), round(100 * wmean(undecided))
    return {
        "score": round(score), "scoreRange": {"low": round(s_lo), "high": round(s_hi)},
        "reactions": {"buy": r_buy, "undecided": r_und, "no": 100 - r_buy - r_und},
        "buyInterval": {"low": b_lo, "high": b_hi},
        "run": {"personas": n, "requested": requested, "runtimeSeconds": round(runtime)},
        "customerPrice": base, "wtp": wtp, "wtpViews": views, "segments": segments, "objections": objections,
        "example_data": False, "source": "token-factory", "model": token_factory.model_name(),
        "method": {"respondents": "Twin-2K-500, reduced profile", "intervals": f"bootstrap, {BOOTSTRAPS} resamples, 95%", "scoreFrom": used, "seed": seed},
    }


# ---- The run ----------------------------------------------------------------------------------------------------------

async def run_panel(pitch: str, audience: str | None = None, category: str | None = None, price: float | None = None, n: int = 100, seed: int = 7,
                    on_progress: Callable[[int, int], None] | None = None, questions: list[dict] | None = None) -> dict[str, Any]:
    started = time.monotonic()
    if not token_factory.configured():
        raise PanelError("Token Factory is not configured")
    if questions is None:
        lines = [f"Product idea or pitch: {pitch.strip()}"] + ([f"Target audience: {audience}"] if audience else []) + ([f"Category: {category}"] if category else []) + ([f"Price: {price:g} US dollars"] if price is not None else [])
        try:
            questions = await evolus.ask_json("EVOLUS_WORKFLOW_QUESTIONS_ID", "\n".join(lines), evolus.validate_questions, complete=bool(audience and category and price is not None), attempts=3)
        except (evolus.EvolusError, evolus.MissingInput) as e:
            raise PanelError(f"could not get the survey from Evolus ({e})") from e
    qs = normalise(questions)
    people = sample(load_profiles(), n, seed)
    survey, sem = survey_text(qs), asyncio.Semaphore(PARALLEL)
    done = 0

    async with token_factory.new_client() as client:
        async def one(p):
            nonlocal done
            a = await ask_respondent(client, sem, p, qs, survey)
            done += 1
            if on_progress:
                on_progress(done, len(people))
            return a
        results = await asyncio.gather(*(one(p) for p in people))
    ok = [(p, a) for p, a in zip(people, results) if a is not None and all(q.key in a for q in qs if q.price is not None)]
    if len(ok) < MIN_OK * len(people):
        raise PanelError(f"only {len(ok)} of {len(people)} respondents answered")
    kept, given = [p for p, _ in ok], [a for _, a in ok]
    census = load_targets()
    weights, weighting = rake(kept, census)
    runtime = time.monotonic() - started
    out = aggregate(kept, given, qs, price, seed, runtime, len(people), weights)
    out["run"]["effectiveN"] = weighting["effectiveN"]
    out["weighting"] = weighting
    plain = aggregate(kept, given, qs, price, seed, runtime, len(people))   # the same answers without weights, to compare
    out["unweighted"] = {"buy": plain["reactions"]["buy"], "buyInterval": plain["buyInterval"], "score": plain["score"], "scoreRange": plain["scoreRange"],
                         "wtp": plain["wtp"], "segments": plain["segments"], "objections": plain["objections"]}
    out["questions"] = questions
    return out


def _main():
    ap = argparse.ArgumentParser(description="Run the panel from the command line and print a summary")
    ap.add_argument("--pitch", required=True)
    ap.add_argument("--audience")
    ap.add_argument("--category")
    ap.add_argument("--price", type=float)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path, help="write the full result as JSON here")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    step = {"last": 0}

    def progress(d, t):
        if d - step["last"] >= 10 or d == t:
            step["last"] = d
            print(f"  {d}/{t} respondents done", flush=True)
    result = asyncio.run(run_panel(a.pitch, a.audience, a.category, a.price, a.n, a.seed, progress))
    if a.out:
        a.out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("questions", "wtpViews")}, indent=1))


if __name__ == "__main__":
    _main()
