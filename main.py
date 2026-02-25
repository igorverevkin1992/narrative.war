import os
import uvicorn
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from scripts.style_search import get_style_examples

app = FastAPI(title="MediaWar Backend", version="3.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"


# ── Models ──────────────────────────────────────────────────────────────────

class TopicRequest(BaseModel):
    topic: str


# ── Existing endpoint ────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "MediaWar Backend is running", "version": "3.3"}


@app.get("/api/prompts")
def get_prompts():
    """
    Serves all agent prompts from the backend.
    Allows updating prompts without rebuilding the frontend bundle.
    Frontend (geminiService.ts) fetches this on first use if VITE_USE_BACKEND_PROMPTS=true.
    """
    from scripts.prompts import AGENT_PROMPTS
    return AGENT_PROMPTS


@app.post("/api/get-harris-style")
async def get_style(request: TopicRequest):
    """Returns Johnny Harris style context from ChromaDB for a given topic."""
    print(f"📥 Style request for: {request.topic}")
    try:
        style_context = get_style_examples(request.topic)
        return {"topic": request.topic, "style_context": style_context}
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Gemini API Proxy ─────────────────────────────────────────────────────────
# All Gemini calls are routed through here so the API key never leaves the server.

@app.post("/api/gemini/{path:path}")
async def gemini_proxy(path: str, request: Request):
    """
    Transparent proxy to Google Generative Language API.
    Frontend sends requests here → backend forwards with server-side API key.
    Supports both regular and streaming (generateContentStream) responses.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured on backend.")

    body = await request.body()
    # path already contains "v1beta/models/..." from the SDK, just prepend base URL
    target_url = f"{GEMINI_BASE_URL}/{path}"
    params = dict(request.query_params)
    params["key"] = GEMINI_API_KEY

    is_stream = "streamGenerateContent" in path or params.get("alt") == "sse"

    async with httpx.AsyncClient(timeout=300.0) as client:
        if is_stream:
            async def stream_generator():
                async with client.stream(
                    "POST",
                    target_url,
                    content=body,
                    params=params,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk

            return StreamingResponse(stream_generator(), media_type="application/json")
        else:
            resp = await client.post(
                target_url,
                content=body,
                params=params,
                headers={"Content-Type": "application/json"},
            )
            return resp.json()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
