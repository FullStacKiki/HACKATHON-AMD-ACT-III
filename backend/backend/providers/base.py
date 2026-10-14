from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any
from backend.models.schemas import IdeaRequest, EvaluationResponse


class BaseInferenceProvider(ABC):
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    @abstractmethod
    async def evaluate(self, request: IdeaRequest) -> EvaluationResponse:
        """Execute evaluation on business idea."""
        pass

    @abstractmethod
    async def stream_progress(self, idea: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream progress steps (step index, percentage, label, active source) for UI needle & world map sync."""
        pass
