from typing import Dict
from backend.providers.base import BaseInferenceProvider
from backend.providers.synthetic_engine import SyntheticInferenceEngine
from backend.providers.gemini_engine import GeminiTeacherEngine
from backend.providers.amd_rocm_engine import AMDROCmInferenceEngine

_REGISTRY: Dict[str, BaseInferenceProvider] = {
    "synthetic": SyntheticInferenceEngine(),
    "gemini": GeminiTeacherEngine(),
    "amd_rocm": AMDROCmInferenceEngine(),
}

def get_provider(name: str = "synthetic") -> BaseInferenceProvider:
    return _REGISTRY.get(name.lower(), _REGISTRY["synthetic"])

def list_providers() -> list:
    return [
        {"id": key, "name": p.name, "description": p.description}
        for key, p in _REGISTRY.items()
    ]
