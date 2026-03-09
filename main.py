import asyncio
import os
import uvicorn
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from scripts.style_search import get_style_examples

PROXY_RETRY_COUNT = 3
PROXY_RETRY_BASE_MS = 1500  # ms, doubles each attempt

app = FastAPI(title="NARRATIVE.WAR Backend", version="3.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"


# ── Models ──────────────────────────────────────────────────────────────────

class TopicRequest(BaseModel):
    topic: str
    k: int = 3  # Number of RAG examples to return from ChromaDB


# ── Existing endpoint ────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "NARRATIVE.WAR Backend is running", "version": "3.3"}


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
    print(f"📥 Style request for: {request.topic} (k={request.k})")
    try:
        style_context = get_style_examples(request.topic, k=request.k)
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

    if is_stream:
        async def stream_generator():
            # Client must live inside the generator — it outlives the route handler
            for attempt in range(PROXY_RETRY_COUNT):
                try:
                    async with httpx.AsyncClient(timeout=300.0) as stream_client:
                        async with stream_client.stream(
                            "POST",
                            target_url,
                            content=body,
                            params=params,
                            headers={"Content-Type": "application/json"},
                        ) as resp:
                            first_chunk = True
                            async for chunk in resp.aiter_bytes():
                                first_chunk = False
                                yield chunk
                            if first_chunk and attempt < PROXY_RETRY_COUNT - 1:
                                # Got a response but no data — treat as disconnect, retry
                                delay = PROXY_RETRY_BASE_MS * (2 ** attempt) / 1000
                                print(f"⚠️  Gemini stream: empty response, retrying in {delay:.1f}s (attempt {attempt + 1}/{PROXY_RETRY_COUNT})")
                                await asyncio.sleep(delay)
                                continue
                    return  # success
                except httpx.RemoteProtocolError as e:
                    if attempt < PROXY_RETRY_COUNT - 1:
                        delay = PROXY_RETRY_BASE_MS * (2 ** attempt) / 1000
                        print(f"❌ Gemini stream disconnected: {e} — retrying in {delay:.1f}s (attempt {attempt + 1}/{PROXY_RETRY_COUNT})")
                        await asyncio.sleep(delay)
                    else:
                        print(f"❌ Gemini stream disconnected: {e} — all retries exhausted")
                        yield b'{"error": "Gemini disconnected before sending response"}'
                except Exception as e:
                    print(f"❌ Gemini stream error: {type(e).__name__}: {e}")
                    yield b'{"error": "Proxy streaming error"}'
                    return

        return StreamingResponse(stream_generator(), media_type="application/json")
    else:
        last_exc: Exception = RuntimeError("No attempts made")
        for attempt in range(PROXY_RETRY_COUNT):
            try:
                async with httpx.AsyncClient(timeout=300.0) as client:
                    resp = await client.post(
                        target_url,
                        content=body,
                        params=params,
                        headers={"Content-Type": "application/json"},
                    )
                    print(f"🔍 Gemini {resp.status_code} for {path.split('/')[-1]} | body[:300]: {resp.text[:300]}")
                    if resp.status_code == 503 and attempt < PROXY_RETRY_COUNT - 1:
                        delay = PROXY_RETRY_BASE_MS * (2 ** attempt) / 1000
                        print(f"⚠️  Gemini 503, retrying in {delay:.1f}s (attempt {attempt + 1}/{PROXY_RETRY_COUNT})")
                        await asyncio.sleep(delay)
                        continue
                    try:
                        return resp.json()
                    except Exception:
                        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON (status {resp.status_code})")
            except HTTPException:
                raise
            except httpx.RemoteProtocolError as e:
                last_exc = e
                if attempt < PROXY_RETRY_COUNT - 1:
                    delay = PROXY_RETRY_BASE_MS * (2 ** attempt) / 1000
                    print(f"❌ Gemini disconnected (non-stream): {e} — retrying in {delay:.1f}s (attempt {attempt + 1}/{PROXY_RETRY_COUNT})")
                    await asyncio.sleep(delay)
                else:
                    print(f"❌ Gemini disconnected (non-stream): {e} — all retries exhausted")
            except Exception as e:
                print(f"❌ Gemini proxy error: {type(e).__name__}: {e}")
                raise HTTPException(status_code=502, detail=f"Proxy error: {type(e).__name__}")
        raise HTTPException(status_code=503, detail="Gemini disconnected before sending response. All retries exhausted.")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
