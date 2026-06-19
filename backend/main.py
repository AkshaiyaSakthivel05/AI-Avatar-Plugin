"""
AI Avatar Plugin — FastAPI application factory.

Run with:
    uv run fastapi dev backend/main.py
"""

import os
import sys
from pathlib import Path

# Allow `backend.*` imports when running from the project root.
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.container import Container
from backend.routes import (
    admin_routes,
    api_routes,
    avatars_route,
    health_route,
    widget_route,
)

_STATIC_DIR = Path(__file__).parent.parent / "static"


def create_app() -> FastAPI:
    container = Container()
    container.wire(packages=["backend.routes"])

    app = FastAPI(title="AI Avatar Plugin", version="1.0.0")
    app.container = container  # type: ignore[attr-defined]

    allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve portrait images at /avatars/<filename>
    avatars_dir = _STATIC_DIR / "avatars"
    avatars_dir.mkdir(exist_ok=True)
    app.mount("/avatars", StaticFiles(directory=str(avatars_dir)), name="avatars")

    app.include_router(health_route.router)
    app.include_router(widget_route.router)
    app.include_router(api_routes.router)
    app.include_router(admin_routes.router)
    app.include_router(avatars_route.router)

    return app


app = create_app()
