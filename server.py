"""Single-server entrypoint for Render (and any one-port host).

Imports the FastAPI app from backend.main and, when the production frontend
build exists (frontend/dist), serves the desk from the same origin as the
API — no Vite dev server or proxy needed.

Run:  uvicorn server:app --host 0.0.0.0 --port $PORT
"""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

from backend.main import app

DIST = Path(__file__).resolve().parent / "frontend" / "dist"

if DIST.joinpath("index.html").exists():

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _frontend(full_path: str):
        # API routes are registered before this catch-all, so they win.
        # Unknown /api/* paths stay 404 instead of serving the SPA.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (DIST / full_path).resolve()
        if candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(DIST / "index.html"))
