import asyncio
import json
import os
import time
from typing import AsyncGenerator, Dict, Any, List, Optional
from backend.models.schemas import (
    IdeaRequest,
    EvaluationResponse,
    DimensionResult,
    FixOption,
    SourceEvidence,
    SourceRegionalScore,
    CustomerSegment,
    CompetitorItem,
    TeacherSurveyQuestion,
)
from backend.providers.base import BaseInferenceProvider
from backend.providers.synthetic_engine import SyntheticInferenceEngine, DEFAULT_SOURCES


class GeminiTeacherEngine(BaseInferenceProvider):
    def __init__(self, api_key: Optional[str] = None):
        super().__init__(
            name="gemini",
            description="Gemini Teacher Model (Generates survey questions, competitor landscape & baseline viability)",
        )
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self._synthetic_fallback = SyntheticInferenceEngine()

    async def stream_progress(self, idea: str) -> AsyncGenerator[Dict[str, Any], None]:
        steps = [
            {"p": 12, "label": "Invoking Gemini Teacher to extract core thesis & target personas", "src": 0},
            {"p": 25, "label": "Formulating psychometric survey questions (Van Westendorp & Likert)", "src": 1},
            {"p": 40, "label": "Querying baseline consumer segments for immediate objections", "src": 2},
            {"p": 55, "label": "Executing real-time competitor discovery and substitution analysis", "src": 7},
            {"p": 70, "label": "Evaluating 6 business viability dimensions & regulatory obstacles", "src": 3},
            {"p": 85, "label": "Calculating willingness-to-pay elasticity and score improvement potential", "src": 4},
            {"p": 100, "label": "Gemini Teacher synthesis complete", "src": 6},
        ]
        for step in steps:
            await asyncio.sleep(0.5)
            yield step

    async def evaluate(self, request: IdeaRequest) -> EvaluationResponse:
        key = request.api_key or self.api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            # Graceful fallback with clear diagnostic note
            res = await self._synthetic_fallback.evaluate(request)
            res.inference_metadata["engine"] = "gemini (fallback to synthetic: GEMINI_API_KEY not configured)"
            res.inference_metadata["note"] = "Provide GEMINI_API_KEY in environment or UI settings to enable live Gemini generation."
            return res

        t0 = time.time()
        prompt = f"""
You are Gemini, acting as the Teacher & Baseline Evaluator for the AMD Developer Hackathon Act III.
A founder has submitted the following business pitch:
---
Idea: {request.idea}
Target Audience: {request.target_audience or 'General Consumer / Market'}
Industry/Category: {request.industry or 'General'}
---
Your task is to:
1. Act as the survey designer: Turn this pitch into 3 precise, professional survey questions (Pricing elasticity, adoption friction, usage velocity).
2. Simulate how 4 diverse consumer segments (inspired by Twin-2K-500 US respondent demographics) would react, their key objections, and their willingness-to-pay estimate with an uncertainty range.
3. Map 3 existing market competitors, their role, and vulnerabilities.
4. Evaluate 6 key business viability dimensions (0-100 score, concise summary, 2 flaws, 2 concrete fixes with point gains, 1-2 source evidence topics):
   - Concept
   - Workflow
   - Strategy
   - Features
   - Risks
   - Metrics
5. Propose 2-3 alternative business directions.

Return STRICT JSON ONLY matching this exact JSON schema:
{{
  "overall_score": 65,
  "verdict": "Needs work",
  "dimensions": [
    {{
      "name": "Concept",
      "score": 70,
      "summary": "...",
      "flaws": ["...", "..."],
      "fixes": [{{"text": "...", "gain": 6}}, {{"text": "...", "gain": 4}}],
      "sources": [{{"title": "...", "url": "https://example.com"}}]
    }}
    // Repeat for: Workflow, Strategy, Features, Risks, Metrics
  ],
  "customer_segments": [
    {{
      "segment_name": "...",
      "demographic_profile": "...",
      "reaction_summary": "...",
      "sentiment": "Positive|Mixed|Negative",
      "sentiment_score": 75,
      "willingness_to_pay": "$15 [$10 - $22]/mo",
      "wtp_estimate": 15.0,
      "wtp_min": 10.0,
      "wtp_max": 22.0,
      "objections": ["...", "..."]
    }}
  ],
  "competitors": [
    {{
      "name": "...",
      "market_role": "...",
      "differentiation": "...",
      "vulnerability": "..."
    }}
  ],
  "survey_questions": [
    {{
      "id": "Q1",
      "category": "Pricing",
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "intent": "..."
    }}
  ],
  "alternative_ideas": ["...", "..."]
}}
"""
        try:
            # Use google-genai or google.generativeai
            import google.generativeai as genai
            genai.configure(api_key=key)
            model = genai.GenerativeModel("gemini-2.5-flash")
            
            # Run in thread pool to not block async loop
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
            )
            raw_text = response.text.strip()
            # Clean possible markdown fence
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            data = json.loads(raw_text.strip())

            # Convert to typed Pydantic models
            dims = []
            for d in data.get("dimensions", []):
                dims.append(
                    DimensionResult(
                        name=d.get("name", "Dimension"),
                        score=int(d.get("score", 50)),
                        summary=d.get("summary", ""),
                        flaws=d.get("flaws", []),
                        fixes=[FixOption(text=f.get("text", ""), gain=int(f.get("gain", 5))) for f in d.get("fixes", [])],
                        sources=[SourceEvidence(title=s.get("title", "Resource"), url=s.get("url", "#")) for s in d.get("sources", [])]
                    )
                )

            # Ensure all 6 dimensions exist
            existing_names = {d.name for d in dims}
            for needed in ["Concept", "Workflow", "Strategy", "Features", "Risks", "Metrics"]:
                if needed not in existing_names:
                    dims.append(DimensionResult(name=needed, score=55, summary="Viability baseline generated.", flaws=["Needs customer testing"], fixes=[FixOption(text="Conduct customer interviews", gain=6)], sources=[]))

            segments = []
            for seg in data.get("customer_segments", []):
                segments.append(
                    CustomerSegment(
                        segment_name=seg.get("segment_name", "Consumer Segment"),
                        demographic_profile=seg.get("demographic_profile", "US Demographic Cohort"),
                        reaction_summary=seg.get("reaction_summary", ""),
                        sentiment=seg.get("sentiment", "Mixed"),
                        sentiment_score=int(seg.get("sentiment_score", 50)),
                        willingness_to_pay=seg.get("willingness_to_pay", "$10 [$5 - $15]"),
                        wtp_estimate=float(seg.get("wtp_estimate", 10.0)),
                        wtp_min=float(seg.get("wtp_min", 5.0)),
                        wtp_max=float(seg.get("wtp_max", 15.0)),
                        objections=seg.get("objections", [])
                    )
                )

            competitors = []
            for comp in data.get("competitors", []):
                competitors.append(
                    CompetitorItem(
                        name=comp.get("name", "Competitor"),
                        market_role=comp.get("market_role", "Market Participant"),
                        differentiation=comp.get("differentiation", ""),
                        vulnerability=comp.get("vulnerability", "")
                    )
                )

            questions = []
            for q in data.get("survey_questions", []):
                questions.append(
                    TeacherSurveyQuestion(
                        id=q.get("id", "Q"),
                        category=q.get("category", "General"),
                        question=q.get("question", ""),
                        options=q.get("options", []),
                        intent=q.get("intent", "")
                    )
                )

            sources = [
                SourceRegionalScore(name=s["name"], region=s["region"], lon=s["lon"], lat=s["lat"], score=s["base"])
                for s in DEFAULT_SOURCES
            ]

            overall = int(data.get("overall_score") or sum(d.score for d in dims) / len(dims))
            verdict_val = "Strong" if overall >= 67 else ("Needs work" if overall >= 40 else "At risk")

            elapsed_ms = int((time.time() - t0) * 1000)

            return EvaluationResponse(
                idea=request.idea,
                target_audience=request.target_audience,
                overall_score=overall,
                verdict=data.get("verdict") or verdict_val,
                sources=sources,
                dimensions=dims,
                alternative_ideas=data.get("alternative_ideas", ["Corporate wellness partnerships", "Community co-op"]),
                customer_segments=segments,
                competitors=competitors,
                survey_questions=questions,
                inference_metadata={
                    "engine": "Gemini 2.5 Flash (Live Teacher Mode)",
                    "latency_ms": elapsed_ms,
                    "hardware": "Cloud Tensor Processing Unit (TPU) / Google AI Studio",
                    "role": "Teacher Model & Baseline Ground Truth",
                }
            )
        except Exception as e:
            # Fallback seamlessly with error notice
            fallback = await self._synthetic_fallback.evaluate(request)
            fallback.inference_metadata["engine"] = f"gemini (fell back due to: {type(e).__name__}: {str(e)[:80]})"
            return fallback
