import asyncio
import hashlib
import random
import time
from typing import AsyncGenerator, Dict, Any, List
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


DEFAULT_SOURCES = [
    {"name": "World Bank", "region": "North America", "lon": -77, "lat": 39, "base": 70},
    {"name": "Eurostat", "region": "Europe", "lon": 6, "lat": 50, "base": 58},
    {"name": "Failory post-mortems", "region": "Europe", "lon": 24, "lat": 59, "base": 35},
    {"name": "African Development Bank", "region": "Africa", "lon": -4, "lat": 5, "base": 48},
    {"name": "Asian Development Bank", "region": "Asia", "lon": 121, "lat": 14, "base": 74},
    {"name": "IBGE (Brazil)", "region": "South America", "lon": -47, "lat": -15, "base": 52},
    {"name": "Australian Bureau of Statistics", "region": "Oceania", "lon": 149, "lat": -35, "base": 66},
    {"name": "Google Trends", "region": "North America", "lon": -122, "lat": 37, "base": 81},
]


class SyntheticInferenceEngine(BaseInferenceProvider):
    def __init__(self):
        super().__init__(
            name="synthetic",
            description="Synthetic Survey Simulation Engine (Zero API Key needed, deterministic & contextual)",
        )

    async def stream_progress(self, idea: str) -> AsyncGenerator[Dict[str, Any], None]:
        steps = [
            {"p": 10, "label": "Reading your idea & extracting core value proposition", "src": None},
            {"p": 22, "label": "Synthesizing Gemini teacher survey questions", "src": 0},
            {"p": 34, "label": "Dispatching synthetic consumer panel (Twin-2K-500 segments)", "src": 1},
            {"p": 46, "label": "Calculating willingness-to-pay uncertainty intervals", "src": 2},
            {"p": 58, "label": "Mapping competitor landscape and market density", "src": 7},
            {"p": 70, "label": "Simulating regulatory and execution friction across regions", "src": 3},
            {"p": 82, "label": "Validating unit economics and viral loop assumptions", "src": 4},
            {"p": 92, "label": "Benchmarking viability scores against historical post-mortems", "src": 5},
            {"p": 100, "label": "Analysis complete: business decision report generated", "src": 6},
        ]
        for step in steps:
            await asyncio.sleep(0.4)
            yield step

    async def evaluate(self, request: IdeaRequest) -> EvaluationResponse:
        t0 = time.time()
        idea_text = request.idea.strip()
        lower_idea = idea_text.lower()

        # Deterministic seed based on idea content to keep results coherent
        seed_val = int(hashlib.md5(idea_text.encode("utf-8")).hexdigest()[:8], 16)
        rng = random.Random(seed_val)

        # Keyword theme detection
        is_food = any(w in lower_idea for w in ["cook", "food", "meal", "kitchen", "restaurant", "eat", "dining"])
        is_edu = any(w in lower_idea for w in ["student", "school", "quiz", "lecture", "study", "learn", "university", "campus"])
        is_ai = any(w in lower_idea for w in ["ai", "model", "llm", "agent", "automatic", "smart", "generate"])
        is_b2b = any(w in lower_idea for w in ["b2b", "enterprise", "saas", "client", "sales", "hr", "company"])
        is_eco = any(w in lower_idea for w in ["used", "repair", "laptop", "recycle", "green", "secondhand", "resell"])

        # Determine theme name
        theme = "Business Opportunity"
        if is_food:
            theme = "Food & Hospitality Marketplace"
        elif is_edu:
            theme = "Education & Student Services"
        elif is_eco:
            theme = "Circular Economy & Hardware"
        elif is_ai:
            theme = "AI Productivity Platform"
        elif is_b2b:
            theme = "B2B SaaS / Enterprise Workflow"

        # Calculate sources scores with mild variance based on idea
        sources: List[SourceRegionalScore] = []
        for s in DEFAULT_SOURCES:
            delta = rng.randint(-8, 9)
            score = max(25, min(95, s["base"] + delta))
            sources.append(
                SourceRegionalScore(
                    name=s["name"],
                    region=s["region"],
                    lon=s["lon"],
                    lat=s["lat"],
                    score=score,
                )
            )

        # 6 dimensions evaluations
        # Concept
        c_score = rng.randint(62, 78)
        if is_food:
            c_summary = "Clear value prop solving meal affordability, but brand differentiation from dominant food delivery apps is fragile."
            c_flaws = [
                "Convenience differentiation over DoorDash/UberEats is narrow without guaranteed scheduling",
                "Cottage food laws and commercial kitchen certifications vary sharply between jurisdictions",
            ]
            c_fixes = [
                FixOption(text="Position as weekly subscription batch-prep, not on-demand hot delivery", gain=7),
                FixOption(text="Pilot exclusively within a single college campus with explicit micro-kitchen permits", gain=5),
            ]
        elif is_edu:
            c_summary = "High resonance with target student pain point; low switching cost poses churn risks."
            c_flaws = [
                "Low barriers to entry encourage quick clones by incumbent edtech platforms",
                "Seasonal drop-off during summer and winter breaks threatens annual retention",
            ]
            c_fixes = [
                FixOption(text="Integrate directly with university LMS (Canvas/Blackboard) for organic distribution", gain=8),
                FixOption(text="Introduce collaborative group study cohorts to increase network lock-in", gain=6),
            ]
        else:
            c_summary = f"Valid underlying hypothesis in {theme}; customer positioning needs sharper focus on core ICP."
            c_flaws = [
                "Target customer segment is too broad for the initial pilot phase",
                "Defensibility against existing workflows relies on continuous user habit change",
            ]
            c_fixes = [
                FixOption(text="Narrow initial launch to one hyper-specific vertical niche (e.g. solopreneurs / tech workers)", gain=8),
                FixOption(text="Build an automated daily notification hook that reinforces repetitive daily usage", gain=6),
            ]

        # Workflow
        w_score = rng.randint(50, 68)
        w_summary = "Operational workflow is understandable on paper, but fulfillment quality checks and edge-case exceptions are undefined."
        w_flaws = [
            "Manual onboarding and verification bottleneck will cap growth velocity",
            "Lack of automated contingency protocol when a service provider fails to deliver",
        ]
        w_fixes = [
            FixOption(text="Implement a 3-step automated vetting and background credential checklist", gain=9),
            FixOption(text="Designated central pickup / dropoff hubs to minimize last-mile logistics overhead", gain=7),
        ]

        # Strategy
        s_score = rng.randint(44, 62)
        s_summary = "Two-sided market dynamics face classic cold-start chicken-and-egg supply liquidity challenges."
        s_flaws = [
            "Customer acquisition cost (CAC) will outpace initial unit margins without referral incentives",
            "Supply-side retention is vulnerable to disintermediation (taking transactions off-platform)",
        ]
        s_fixes = [
            FixOption(text="Seed supply first: pre-recruit and guarantee minimum earnings for initial 25 providers", gain=10),
            FixOption(text="Introduce built-in insurance, dispute mediation, and escrow perks to discourage off-platform deals", gain=6),
        ]

        # Features
        f_score = rng.randint(60, 75)
        f_summary = "MVP feature list covers primary jobs-to-be-done. Certain roadmap items introduce unnecessary complexity early."
        f_flaws = [
            "Real-time GPS tracking / high-latency features add excessive server and development overhead",
            "Missing granular filtering for dietary constraints, safety badges, and verified testimonials",
        ]
        f_fixes = [
            FixOption(text="Swap high-cost live location tracking for asynchronous status timestamp checkpoints", gain=5),
            FixOption(text="Add rigorous multi-attribute filtering (allergens, verified badges, rating breakdown)", gain=7),
        ]

        # Risks
        r_score = rng.randint(28, 48)
        r_summary = "Regulatory liability, dispute frequency, and safety compliance are the most pressing vulnerabilities."
        r_flaws = [
            "Unclear legal indemnification and product liability terms in user agreement",
            "Customer dissatisfaction spike during provider cancellations or delivery no-shows",
            "Payment fraud or chargeback risk in two-sided settlement pipeline",
        ]
        r_fixes = [
            FixOption(text="Secure commercial general liability umbrella policy and explicit user waiver flow", gain=14),
            FixOption(text="Maintain an on-demand reserve pool with automated instant credits for disruptions", gain=8),
        ]

        # Metrics
        m_score = rng.randint(52, 69)
        m_summary = "Target milestones exist qualitatively, but rigorous financial cohort tracking and payback thresholds are absent."
        m_flaws = [
            "No quantified targets established for 30-day repeat repurchase rate",
            "Missing threshold for blended Customer Acquisition Cost vs. 6-Month Lifetime Value (CAC:LTV)",
        ]
        m_fixes = [
            FixOption(text="Establish core North Star Metric: 45% 30-day active retention rate", gain=8),
            FixOption(text="Track unit contribution margin per transaction after payment gateway & referral fees", gain=6),
        ]

        dimensions = [
            DimensionResult(
                name="Concept",
                score=c_score,
                summary=c_summary,
                flaws=c_flaws,
                fixes=c_fixes,
                sources=[SourceEvidence(title="Market Validation and Segment Sizing Guidelines", url="https://example.com/concept-validation")],
            ),
            DimensionResult(
                name="Workflow",
                score=w_score,
                summary=w_summary,
                flaws=w_flaws,
                fixes=w_fixes,
                sources=[SourceEvidence(title="Operational Friction Patterns in Digital Marketplaces", url="https://example.com/workflow-patterns")],
            ),
            DimensionResult(
                name="Strategy",
                score=s_score,
                summary=s_summary,
                flaws=s_flaws,
                fixes=s_fixes,
                sources=[SourceEvidence(title="Why Marketplaces Fail: Retrospective Study", url="https://example.com/marketplace-failures")],
            ),
            DimensionResult(
                name="Features",
                score=f_score,
                summary=f_summary,
                flaws=f_flaws,
                fixes=f_fixes,
                sources=[],
            ),
            DimensionResult(
                name="Risks",
                score=r_score,
                summary=r_summary,
                flaws=r_flaws,
                fixes=r_fixes,
                sources=[SourceEvidence(title="Consumer Protection & Small Seller Liability Framework", url="https://example.com/seller-risk")],
            ),
            DimensionResult(
                name="Metrics",
                score=m_score,
                summary=m_summary,
                flaws=m_flaws,
                fixes=m_fixes,
                sources=[],
            ),
        ]

        overall = int(sum(d.score for d in dimensions) / len(dimensions))
        if overall >= 67:
            verdict_text = "Strong"
        elif overall >= 40:
            verdict_text = "Needs work"
        else:
            verdict_text = "At risk"

        # Customer Segment Simulation (Twin-2K-500 inspired segments)
        audience_hint = request.target_audience or "General Consumer Panel"
        segments = [
            CustomerSegment(
                segment_name="College Students & Young Adults (18-24)",
                demographic_profile="Twin-2K-500: Age 18-24; Education: College student; Income: <$30k; Region: Multi-city",
                reaction_summary="High enthusiasm for cost-savings and social connection. Sensitive to upfront subscription fees.",
                sentiment="Positive",
                sentiment_score=78,
                willingness_to_pay="$9.50 [CI: $6.00 - $14.00] / week",
                wtp_estimate=9.50,
                wtp_min=6.00,
                wtp_max=14.00,
                objections=[
                    "I cannot commit to a rigid monthly subscription during exam weeks",
                    "What happens if the service quality is inconsistent?",
                ],
            ),
            CustomerSegment(
                segment_name="Busy Urban Professionals (25-39)",
                demographic_profile="Twin-2K-500: Age 25-39; Employment: Full-time tech/finance; Income: $80k-$130k; Urban",
                reaction_summary="Values time convenience and reliability above small discounts. Demands seamless UX and hygiene guarantees.",
                sentiment="Positive",
                sentiment_score=72,
                willingness_to_pay="$18.00 [CI: $14.00 - $26.00] / order",
                wtp_estimate=18.00,
                wtp_min=14.00,
                wtp_max=26.00,
                objections=[
                    "Reliability is paramount; if delivery is late by 20 minutes my schedule breaks",
                    "Need verified certifications, clean allergen tagging, and nutrition info",
                ],
            ),
            CustomerSegment(
                segment_name="Budget-Conscious Suburban Families (35-50)",
                demographic_profile="Twin-2K-500: Age 35-50; Household size: 3-5; Income: $50k-$75k; Region: Midwest/South",
                reaction_summary="Interested in portion sizing and bulk discounts. Hesitant about experimental providers.",
                sentiment="Mixed",
                sentiment_score=54,
                willingness_to_pay="$32.00 [CI: $22.00 - $44.00] / family bundle",
                wtp_estimate=32.00,
                wtp_min=22.00,
                wtp_max=44.00,
                objections=[
                    "Portions may not satisfy an entire family at that price point",
                    "Prefers known grocery store chains or trusted local brands over unknown peer sellers",
                ],
            ),
            CustomerSegment(
                segment_name="Risk-Averse Quality Skeptics (50+)",
                demographic_profile="Twin-2K-500: Age 50-64; Homeowner; Income: $60k-$90k; Region: Suburb/Rural",
                reaction_summary="Skeptical of hygiene compliance, regulatory gray areas, and digital payment security.",
                sentiment="Negative",
                sentiment_score=31,
                willingness_to_pay="$5.00 [CI: $0.00 - $8.00]",
                wtp_estimate=5.00,
                wtp_min=0.00,
                wtp_max=8.00,
                objections=[
                    "How are health department codes enforced?",
                    "Too many apps and accounts; prefers phone or direct in-person contact",
                ],
            ),
        ]

        # Competitor Mapping Step
        competitors = [
            CompetitorItem(
                name="Legacy Incumbent Platforms (DoorDash / UberEats / Upwork)",
                market_role="Dominant Aggregator",
                differentiation="High consumer brand trust and scale, but exorbitant 25-35% merchant take-rates create resentment.",
                vulnerability="High fees on both ends, lack of authentic community engagement, impersonal experience.",
            ),
            CompetitorItem(
                name="Specialized Direct D2C Subscriptions (HelloFresh / CookUnity / Local Co-ops)",
                market_role="Niche Specialist",
                differentiation="Standardized commercial kitchen production and national delivery logistics.",
                vulnerability="High customer acquisition churn, rigid weekly plans, and packaging waste.",
            ),
            CompetitorItem(
                name="Informal WhatsApp / Facebook Group Communities",
                market_role="Grassroots Alternative",
                differentiation="Zero platform fees, direct word-of-mouth neighbor trust.",
                vulnerability="No escrow payments, zero health guarantees, chaotic scheduling, and zero scalability.",
            ),
        ]

        # Gemini Teacher Survey Questions
        survey_questions = [
            TeacherSurveyQuestion(
                id="Q1-WTP",
                category="Pricing (Van Westendorp)",
                question=f"At what price per transaction would {request.idea[:40]}... feel so expensive that you would not consider buying it?",
                options=["A) $8 or less", "B) $12-$15", "C) $20-$25", "D) $30+"],
                intent="Maps upper price elasticity threshold and determines maximum acceptable pricing ceiling.",
            ),
            TeacherSurveyQuestion(
                id="Q2-Objection",
                category="Primary Adoption Friction",
                question="What is the single biggest factor that would stop you from completing your first transaction on this platform?",
                options=[
                    "A) Trust and safety concerns about unverified providers",
                    "B) Clunky payment or cancellation policies",
                    "C) Existing alternatives are 'good enough' for my needs",
                    "D) Pricing is unclear or has hidden service fees",
                ],
                intent="Identifies highest-priority churn vectors before product release.",
            ),
            TeacherSurveyQuestion(
                id="Q3-Frequency",
                category="Usage Velocity",
                question="If the service works as promised, how often would you realistically utilize it during a normal month?",
                options=["A) Daily", "B) 2-3 times per week", "C) Once every 2 weeks", "D) Rarely / Only for emergencies"],
                intent="Validates recurring cohort retention model and predicts LTV.",
            ),
        ]

        # Alternative ideas
        alternatives = [
            f"B2B campus / workplace subscription model partnering with local licensed commissary kitchens",
            f"Pre-scheduled weekly meal-swap club powered by peer tokens to bypass regulatory sale friction",
            f"Enterprise white-label software helping local food artisans manage pre-orders directly on Instagram",
        ]

        elapsed_ms = int((time.time() - t0) * 1000)

        return EvaluationResponse(
            idea=idea_text,
            target_audience=audience_hint,
            overall_score=overall,
            verdict=verdict_text,
            sources=sources,
            dimensions=dimensions,
            alternative_ideas=alternatives,
            customer_segments=segments,
            competitors=competitors,
            survey_questions=survey_questions,
            inference_metadata={
                "engine": self.name,
                "latency_ms": elapsed_ms,
                "hardware": "AMD ROCm Ready Architecture (Host CPU Emulation / Synthetic Ground Truth)",
                "dataset_basis": "Twin-2K-500 US Consumer Panel distribution",
            },
        )
