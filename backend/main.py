import os
import sys
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# Ensure parent directory is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.models.schemas import IdeaRequest, EvaluationResponse
from backend.providers import get_provider, list_providers

app = FastAPI(
    title="AMD Instinct AI Business Evaluator API",
    description="Backend API powering synthetic consumer panels, Gemini teacher surveys, and ROCm business viability assessment.",
    version="1.0.0",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Evolus agents: /api/questions and /api/briefing
from backend.evolus_routes import router as evolus_router
app.include_router(evolus_router)
from backend.panel_routes import router as panel_router
app.include_router(panel_router)

# Static directory
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/api/health")
async def health_check():
    """Health check and runtime environment info."""
    import platform
    return {
        "status": "healthy",
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "providers_available": [p["id"] for p in list_providers()],
        "amd_rocm_ready": True,
        "active_gpu_target": "AMD Instinct MI300X (ROCm 6.2+)",
    }


@app.get("/api/providers")
async def get_available_providers():
    """Return all available AI engine providers."""
    return list_providers()


@app.post("/api/evaluate", response_model=EvaluationResponse)
async def evaluate_business_idea(request: IdeaRequest):
    """
    Core evaluation endpoint:
    Processes the business idea and target audience through the selected AI provider
    (Synthetic, Gemini Teacher, or AMD ROCm Panel).
    """
    if not request.idea or not request.idea.strip():
        raise HTTPException(status_code=400, detail="Business idea cannot be empty")

    provider = get_provider(request.provider or "synthetic")
    try:
        response = await provider.evaluate(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.get("/api/stream-steps")
async def stream_analysis_steps(idea: str = Query(..., description="Idea text to simulate steps for")):
    """Server-Sent Events (SSE) stream for real-time progress steps."""
    provider = get_provider("synthetic")

    async def event_generator():
        import json
        async for step in provider.stream_progress(idea):
            yield f"data: {json.dumps(step)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the complete web UI."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>AMD Business Viability Platform</h1><p>Static index.html not found.</p>")


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
