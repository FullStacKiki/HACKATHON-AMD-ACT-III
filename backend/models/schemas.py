from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class IdeaRequest(BaseModel):
    idea: str = Field(..., description="Description of the business idea or pitch")
    target_audience: Optional[str] = Field(None, description="Optional target consumer segment or audience")
    industry: Optional[str] = Field(None, description="Optional industry or category")
    provider: Optional[str] = Field("synthetic", description="Inference engine: 'synthetic', 'gemini', or 'amd_rocm'")
    api_key: Optional[str] = Field(None, description="Optional API key for Gemini")


class FixOption(BaseModel):
    text: str
    gain: int


class SourceEvidence(BaseModel):
    title: str
    url: str


class DimensionResult(BaseModel):
    name: str  # Concept, Workflow, Strategy, Features, Risks, Metrics
    score: int  # 0 to 100
    summary: str
    flaws: List[str] = []
    fixes: List[FixOption] = []
    sources: List[SourceEvidence] = []


class SourceRegionalScore(BaseModel):
    name: str
    region: str
    lon: float
    lat: float
    score: int


class CustomerSegment(BaseModel):
    segment_name: str
    demographic_profile: str
    reaction_summary: str
    sentiment: str  # "Positive", "Mixed", "Negative"
    sentiment_score: int  # 0-100
    willingness_to_pay: str  # e.g. "$14 [$10 - $19]/mo"
    wtp_estimate: float
    wtp_min: float
    wtp_max: float
    objections: List[str]


class CompetitorItem(BaseModel):
    name: str
    market_role: str
    differentiation: str
    vulnerability: str


class TeacherSurveyQuestion(BaseModel):
    id: str
    category: str
    question: str
    options: List[str]
    intent: str


class EvaluationResponse(BaseModel):
    idea: str
    target_audience: Optional[str] = None
    overall_score: int
    verdict: str  # "At risk", "Needs work", "Strong"
    sources: List[SourceRegionalScore]
    dimensions: List[DimensionResult]
    alternative_ideas: List[str]
    customer_segments: List[CustomerSegment]
    competitors: List[CompetitorItem]
    survey_questions: List[TeacherSurveyQuestion]
    inference_metadata: Dict[str, Any] = {}
