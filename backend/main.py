"""
AI Avatar Plugin — FastAPI backend

Endpoints:
  GET  /widget.js            Serve the embeddable widget script
  GET  /api/config           Public config (agent name, health)
  POST /api/token            Get ElevenLabs WebRTC token + dynamic variables
  GET  /api/admin/config     Full admin config
  PUT  /api/admin/config     Update config (agent name, etc.)
"""

import os
import sys
import httpx
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from config import load_config, save_config, get_api_key

load_dotenv()

app = FastAPI(title="AI Avatar Plugin", version="1.0.0")

STATIC_DIR = Path(__file__).parent.parent / "static"

# CORS — allow all origins so the widget works on any host app
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    url: Optional[str] = ""
    title: Optional[str] = ""
    content: Optional[str] = ""
    extra: Optional[dict] = None  # host app can pass arbitrary structured data


class ConfigUpdate(BaseModel):
    agent_name: Optional[str] = None
    agent_id: Optional[str] = None
    agent_first_message: Optional[str] = None
    max_context_chars: Optional[int] = None


# ── Widget serving ────────────────────────────────────────────────────────────

@app.get("/widget.js", include_in_schema=False)
async def serve_widget():
    widget_path = STATIC_DIR / "widget.js"
    if not widget_path.exists():
        raise HTTPException(status_code=404, detail="widget.js not found")
    return FileResponse(
        widget_path,
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


# ── Public API ────────────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_public_config():
    config = load_config()
    return {
        "agent_name": config.get("agent_name", "AI Assistant"),
        "ready": bool(config.get("agent_id")) and bool(get_api_key()),
    }


@app.post("/api/token")
async def get_token(body: TokenRequest):
    config = load_config()
    api_key = get_api_key()
    agent_id = config.get("agent_id")

    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured.")
    if not agent_id:
        raise HTTPException(
            status_code=400,
            detail="Agent not set up. Run: python setup_agent.py",
        )

    # Get WebRTC token from ElevenLabs
    max_chars = config.get("max_context_chars", 6000)
    resp = httpx.get(
        "https://api.elevenlabs.io/v1/convai/conversation/token",
        headers={"xi-api-key": api_key},
        params={"agent_id": agent_id},
        timeout=10,
    )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs token error: {resp.text}",
        )

    token = resp.json().get("token", "")

    # Build page context string — injected as a dynamic variable
    parts = []
    if body.title:
        parts.append(f"Page Title: {body.title}")
    if body.url:
        parts.append(f"URL: {body.url}")
    if body.content:
        parts.append(f"\nPage Content:\n{body.content[:max_chars]}")
    if body.extra:
        import json
        parts.append(f"\nApp Data:\n{json.dumps(body.extra, indent=2)[:2000]}")

    page_context = "\n".join(parts) if parts else "No page context captured."

    return {
        "token": token,
        "dynamic_variables": {
            "page_context": page_context,
            "agent_name": config.get("agent_name", "AI Assistant"),
        },
    }


# ── Admin API ─────────────────────────────────────────────────────────────────

@app.get("/api/admin/config")
async def get_admin_config():
    config = load_config()
    return {
        **config,
        "has_api_key": bool(get_api_key()),
    }


@app.put("/api/admin/config")
async def update_admin_config(update: ConfigUpdate):
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    config = save_config(updates)
    return {"status": "ok", "config": config}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    config = load_config()
    return {
        "service": "AI Avatar Plugin",
        "version": "1.0.0",
        "ready": bool(config.get("agent_id")) and bool(get_api_key()),
    }
